"use client";

import { useCallback, useRef, useState } from "react";

type UploadResult = { ok: boolean; message?: string };

export function UploadZone({ onDone }: { onDone?: (recordId: string | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<UploadResult | null>(null);

  const upload = useCallback(
    async (file: File): Promise<void> => {
      setUploading(true);
      setStatus(null);
      try {
        if (file.size > 8 * 1024 * 1024) throw new Error("File must be smaller than 8 MB");
        if (!/\.(pdf|txt)$/i.test(file.name)) throw new Error("Only text-based PDF and TXT files are supported currently");
        const { content, isBase64 } = await readFileForUpload(file);
        const res = await fetch("/api/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileName: file.name, content, isBase64 }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setStatus({ ok: false, message: data.error || "Upload failed" });
          return;
        }
        setStatus({ ok: true, message: data.duplicate ? "Already uploaded (duplicate)" : data.demoMode ? "Extracted with demo parsing; verify the fields" : "Extracted successfully" });
        onDone?.(data.id ?? null);
      } catch (e) {
        setStatus({ ok: false, message: e instanceof Error ? e.message : "Upload failed" });
      } finally {
        setUploading(false);
        if (inputRef.current) inputRef.current.value = "";
      }
    },
    [onDone]
  );

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (file) upload(file);
    },
    [upload]
  );

  return (
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
        handleFiles(e.dataTransfer.files);
      }}
    >
      <div className="grid justify-items-center gap-2">
        <p className="font-medium text-ink">
          {uploading ? "Extracting document data…" : "Drop an invoice or receipt to extract"}
        </p>
        <p className="text-sm text-muted">Text-based PDF or TXT, up to 8 MB</p>
      </div>
      <button
        type="button"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        className="btn-primary"
      >
        {uploading ? "Working…" : "Choose a file"}
      </button>
      {status && (
        <p
          role={status.ok ? "status" : "alert"}
          className={status.ok ? "text-sm text-success" : "text-sm text-error"}
        >
          {status.message}
        </p>
      )}
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.txt,text/plain,application/pdf"
        aria-label="Choose a text-based PDF or TXT file"
        className="visually-hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
    </div>
  );
}

async function readFileForUpload(
  file: File
): Promise<{ content: string; isBase64: boolean }> {
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (ext === "pdf" || file.type === "application/pdf") {
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

