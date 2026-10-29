"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { DOC_TYPES, PRESETS, type DocType } from "@/lib/docTypes";
import { MAX_FILE_MB, formatResetDate, type DocumentQuota, type UsageSnapshot } from "@/lib/plans";

const MAX_BYTES = MAX_FILE_MB * 1024 * 1024;
const MAX_CONCURRENT = 2;
const SUPPORTED = /\.(pdf|txt|jpe?g|png|webp)$/i;

type ItemStatus = "queued" | "uploading" | "extracting" | "done" | "failed";

interface BatchItem {
  key: string;
  file: File;
  /** Type chosen when the file was added; "auto" lets the server detect it. */
  docType: DocType | "auto";
  /** Type the server actually used, once known. */
  resolvedType?: DocType;
  status: ItemStatus;
  /** 0–1 transfer progress; reaches 1 when the server starts extracting. */
  progress: number;
  message?: string;
  recordId?: string;
  /** False when the file failed a local check no retry can fix (format, size). */
  retryable?: boolean;
}

interface UploadResponse {
  id?: string;
  duplicate?: boolean;
  demoMode?: boolean;
  docType?: DocType;
  error?: string;
  /** Allowance after this document was counted; absent for duplicates. */
  usage?: DocumentQuota;
  quotaExceeded?: boolean;
  planName?: string;
  used?: number;
  limit?: number;
  resetsAt?: string;
}

/** A non-2xx upload keeps its body so the caller can explain a quota stop precisely. */
class UploadFailed extends Error {
  readonly body: UploadResponse;
  constructor(message: string, body: UploadResponse) {
    super(message);
    this.name = "UploadFailed";
    this.body = body;
  }
}

function quotaFromSnapshot(usage: UsageSnapshot): DocumentQuota {
  return {
    plan: usage.plan,
    planName: usage.planName,
    limit: usage.documents.limit,
    used: usage.documents.used,
    remaining: usage.documents.remaining,
    resetsAt: usage.resetsAt,
  };
}

const CHIP_STATUS: Record<ItemStatus, string | undefined> = {
  queued: undefined,
  uploading: "processing",
  extracting: "processing",
  done: "extracted",
  failed: "failed",
};

function statusText(item: BatchItem): string {
  switch (item.status) {
    case "queued":
      return "Waiting";
    case "uploading":
      return `Uploading ${Math.round(item.progress * 100)}%`;
    case "extracting":
      return "Extracting…";
    case "done":
      return "Extracted";
    case "failed":
      return "Failed";
  }
}

function validateFile(file: File): string | null {
  if (file.size > MAX_BYTES) return "File must be smaller than 8 MB";
  if (!SUPPORTED.test(file.name)) return "Supported formats: PDF, TXT, JPG, PNG, WebP";
  return null;
}

function isRetryable(item: BatchItem): boolean {
  return item.status === "failed" && item.retryable !== false;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function UploadZone({
  onDone,
  usage,
}: {
  onDone?: (recordId: string | null) => void;
  usage?: UsageSnapshot | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [items, setItems] = useState<BatchItem[]>([]);
  const [docTypeChoice, setDocTypeChoice] = useState<DocType | "auto">("auto");
  const [quota, setQuota] = useState<DocumentQuota | null>(() =>
    usage ? quotaFromSnapshot(usage) : null
  );
  const exhausted = quota !== null && quota.remaining <= 0;

  // Tell the header chip to re-read the allowance after a document is counted.
  const applyQuota = useCallback((next: DocumentQuota) => {
    setQuota(next);
    window.dispatchEvent(new Event("extracto:usage"));
  }, []);

  const queueRef = useRef<BatchItem[]>([]);
  const workersRef = useRef(0);
  const pumpRef = useRef<() => void>(() => {});
  const seqRef = useRef(0);

  const update = useCallback((key: string, patch: Partial<BatchItem>) => {
    setItems((prev) => {
      const current = prev.find((item) => item.key === key);
      if (!current) return prev;
      const changed = (Object.keys(patch) as (keyof BatchItem)[]).some(
        (field) => current[field] !== patch[field]
      );
      return changed ? prev.map((item) => (item.key === key ? { ...item, ...patch } : item)) : prev;
    });
  }, []);

  const processItem = useCallback(
    async (item: BatchItem) => {
      const problem = validateFile(item.file);
      if (problem) {
        update(item.key, { status: "failed", progress: 0, message: problem, retryable: false });
        return;
      }

      update(item.key, { status: "uploading", progress: 0, message: undefined });
      try {
        const { content, isBase64 } = await readFileForUpload(item.file);
        const data = await postUpload(item.file.name, content, isBase64, item.docType, (fraction) => {
          const progress = Math.round(Math.max(0, Math.min(1, fraction)) * 50) / 50;
          update(
            item.key,
            progress >= 1 ? { status: "extracting", progress: 1 } : { progress }
          );
        });

        if (data.usage) applyQuota(data.usage);
        update(item.key, {
          status: "done",
          progress: 1,
          retryable: true,
          recordId: data.id,
          resolvedType: data.docType,
          message: data.duplicate
            ? "Already uploaded, kept the existing record"
            : data.demoMode
              ? "Extracted with demo parsing; verify the fields"
              : "Extracted successfully",
        });
        onDone?.(data.id ?? null);
      } catch (err) {
        const body = err instanceof UploadFailed ? err.body : undefined;
        if (body?.quotaExceeded) {
          window.dispatchEvent(new Event("extracto:usage"));
          // Nothing retryable about a spent allowance: it resets next month.
          setQuota((prev) =>
            prev
              ? {
                  ...prev,
                  used: body.used ?? prev.used,
                  limit: body.limit ?? prev.limit,
                  remaining: 0,
                  resetsAt: body.resetsAt ?? prev.resetsAt,
                  planName: body.planName ?? prev.planName,
                }
              : prev
          );
        }
        update(item.key, {
          status: "failed",
          retryable: !body?.quotaExceeded,
          message: err instanceof Error ? err.message : "Upload failed",
        });
      }
    },
    [applyQuota, onDone, update]
  );

  // Keep a couple of files in flight so one slow extraction does not block the batch,
  // while a free slot can always pick up a newly queued (or retried) file right away.
  const pump = useCallback(() => {
    while (workersRef.current < MAX_CONCURRENT && queueRef.current.length > 0) {
      workersRef.current += 1;
      void (async () => {
        for (;;) {
          const next = queueRef.current.shift();
          if (!next) break;
          await processItem(next);
        }
        workersRef.current -= 1;
        if (queueRef.current.length > 0) pumpRef.current();
      })();
    }
  }, [processItem]);

  useEffect(() => {
    pumpRef.current = pump;
  }, [pump]);

  const enqueue = useCallback((batch: BatchItem[]) => {
    if (batch.length === 0) return;
    queueRef.current.push(...batch);
    pumpRef.current();
  }, []);

  const addFiles = useCallback(
    (files: FileList | File[] | null) => {
      const list = Array.from(files ?? []);
      if (list.length === 0) return;

      const batch: BatchItem[] = list.map((file) => ({
        key: `file-${++seqRef.current}`,
        file,
        docType: docTypeChoice,
        status: "queued",
        progress: 0,
      }));

      setItems((prev) => [...prev, ...batch]);
      enqueue(batch);
    },
    [docTypeChoice, enqueue]
  );

  const retry = useCallback(
    (keys: string[]) => {
      const targets = items.filter((item) => keys.includes(item.key) && isRetryable(item));
      if (targets.length === 0) return;

      setItems((prev) =>
        prev.map((item) =>
          keys.includes(item.key) && isRetryable(item)
            ? { ...item, status: "queued", progress: 0, message: undefined }
            : item
        )
      );
      enqueue(targets);
    },
    [enqueue, items]
  );

  const remove = useCallback((keys: string[]) => {
    setItems((prev) => prev.filter((item) => !keys.includes(item.key)));
    queueRef.current = queueRef.current.filter((item) => !keys.includes(item.key));
  }, []);

  const clearFinished = useCallback(() => {
    setItems((prev) => prev.filter((item) => item.status !== "done"));
  }, []);

  const counts = items.reduce(
    (acc, item) => {
      acc[item.status] += 1;
      return acc;
    },
    { queued: 0, uploading: 0, extracting: 0, done: 0, failed: 0 } as Record<ItemStatus, number>
  );
  const active = counts.queued + counts.uploading + counts.extracting;
  const failedKeys = items.filter(isRetryable).map((item) => item.key);
  const skippedKeys = items
    .filter((item) => item.status === "failed" && item.retryable === false)
    .map((item) => item.key);
  const summary = [
    `${counts.done} of ${items.length} done`,
    active > 0 ? `${active} in progress` : null,
    failedKeys.length > 0 ? `${failedKeys.length} failed` : null,
    skippedKeys.length > 0 ? `${skippedKeys.length} skipped` : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="grid gap-4">
      {exhausted && quota ? (
        <div className="drop-zone" data-exhausted="true">
          <div className="grid justify-items-center gap-2">
            <p className="font-medium text-ink">Monthly limit reached</p>
            <p className="max-w-[46ch] text-sm text-muted">
              You have processed {quota.used} of {quota.limit} documents on the {quota.planName} plan.
              Your allowance resets on {formatResetDate(quota.resetsAt)}; a larger plan keeps you
              processing now.
            </p>
            <Link href="/settings#billing" className="btn-primary">See plans</Link>
          </div>
        </div>
      ) : (
      <div
        className="drop-zone"
        data-dragging={dragging}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          addFiles(e.dataTransfer.files);
        }}
      >
        <div className="grid justify-items-center gap-2">
          <p className="font-medium text-ink">Drop invoices, receipts, or bank statements</p>
          <p className="text-sm text-muted">
            {items.length > 0
              ? "Add more files at any time; the batch keeps its place."
              : "Select several files at once; each one is extracted on its own."}
          </p>
          {quota && (
            <p className={quota.remaining <= 3 ? "text-xs text-accent" : "text-xs text-muted"}>
              {quota.remaining} of {quota.limit} documents left this month. Resets{" "}
              {formatResetDate(quota.resetsAt)}.
            </p>
          )}
          <button type="button" onClick={() => inputRef.current?.click()} className="btn-primary">
            {items.length > 0 ? "Add more files" : "Choose files"}
          </button>
          <label className="mt-1 grid w-[220px] gap-1 text-left">
            <span className="field-label">Extract as</span>
            <select
              value={docTypeChoice}
              onChange={(e) => setDocTypeChoice(e.target.value as DocType | "auto")}
              className="field-control field-control-select"
            >
              <option value="auto">Detect automatically</option>
              {DOC_TYPES.map((type) => (
                <option key={type} value={type}>{PRESETS[type].label}</option>
              ))}
            </select>
          </label>
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.txt,.jpg,.jpeg,.png,.webp,text/plain,application/pdf,image/jpeg,image/png,image/webp"
          aria-label="Choose one or more PDF, TXT, or image files"
          className="visually-hidden"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      )}

      {items.length > 0 && (
        <section className="surface" aria-label="Upload batch">
          <div className="batch-head">
            <div className="min-w-0">
              <p className="font-medium text-ink">Batch progress</p>
              <p className="text-sm text-muted" aria-live="polite">
                {summary}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {failedKeys.length > 0 && (
                <button type="button" className="btn-secondary" onClick={() => retry(failedKeys)}>
                  Retry failed ({failedKeys.length})
                </button>
              )}
              {counts.done > 0 && (
                <button type="button" className="btn-quiet" onClick={clearFinished}>
                  Clear finished
                </button>
              )}
              <Link href="/documents" className="btn-quiet">
                Documents
              </Link>
            </div>
          </div>

          <ul className="batch-list">
            {items.map((item) => {
              const percent = Math.round(item.progress * 100);
              const showRail = item.status !== "done" && item.status !== "failed";
              return (
                <li key={item.key} className="batch-row" data-status={item.status}>
                  <div className="batch-row-main">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink" title={item.file.name}>
                        {item.file.name}
                      </p>
                      <p
                        className={
                          item.status === "failed"
                            ? "mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-error"
                            : item.status === "done"
                              ? "mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-success"
                              : "mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted"
                        }
                      >
                        <span>{formatSize(item.file.size)}</span>
                        {item.resolvedType ? <span>{PRESETS[item.resolvedType].label}</span> : null}
                        {item.message ? <span>{item.message}</span> : null}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="status-chip" data-status={CHIP_STATUS[item.status]}>
                        {statusText(item)}
                      </span>
                      {isRetryable(item) && (
                        <button
                          type="button"
                          className="btn-quiet"
                          onClick={() => retry([item.key])}
                          aria-label={`Retry ${item.file.name}`}
                        >
                          Retry
                        </button>
                      )}
                      {item.status === "failed" && item.retryable === false && (
                        <button
                          type="button"
                          className="btn-quiet"
                          onClick={() => remove([item.key])}
                          aria-label={`Remove ${item.file.name}`}
                        >
                          Remove
                        </button>
                      )}
                      {item.status === "done" && item.recordId && (
                        <Link href={`/record/${item.recordId}`} className="btn-quiet">
                          Review
                        </Link>
                      )}
                    </div>
                  </div>

                  {showRail && (
                    <div
                      className="batch-track"
                      role="progressbar"
                      aria-label={`${item.file.name} progress`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={percent}
                      aria-valuetext={statusText(item)}
                    >
                      <span
                        className="batch-fill"
                        data-state={item.status}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

async function readFileForUpload(
  file: File
): Promise<{ content: string; isBase64: boolean }> {
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (ext === "pdf" || ext === "jpg" || ext === "jpeg" || ext === "png" || ext === "webp" || file.type === "application/pdf" || file.type.startsWith("image/")) {
    const dataUrl: string = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    return { content: dataUrl.split(",")[1] ?? "", isBase64: true };
  }
  return { content: await file.text(), isBase64: false };
}

function postUpload(
  fileName: string,
  content: string,
  isBase64: boolean,
  docType: DocType | "auto",
  onProgress: (fraction: number) => void
): Promise<UploadResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload");
    xhr.setRequestHeader("Content-Type", "application/json");

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress(event.loaded / event.total);
    };
    // Body fully sent: the server is now extracting, so the bar holds at 100%.
    xhr.upload.onload = () => onProgress(1);
    xhr.onerror = () => reject(new Error("Network error. Check your connection."));
    xhr.onabort = () => reject(new Error("Upload cancelled"));
    xhr.ontimeout = () => reject(new Error("Upload timed out"));
    xhr.onload = () => {
      let data: UploadResponse = {};
      try {
        data = JSON.parse(xhr.responseText || "{}") as UploadResponse;
      } catch {
        data = {};
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new UploadFailed(data.error || `Upload failed (${xhr.status})`, data));
    };

    xhr.send(JSON.stringify({ fileName, content, isBase64, docType }));
  });
}
