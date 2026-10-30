import type { NextApiRequest, NextApiResponse } from "next";
import { buildHash } from "@/lib/extractor";
import { extractStructured } from "@/lib/ocr";
import { extractTextFromFile } from "@/lib/extractText";
import { saveDocument } from "@/lib/fileStore";
import { getActiveWorkspace, getRecord, upsertRecord } from "@/lib/storage";
import { recordActivity } from "@/lib/audit";
import {
  coerceFields,
  detectDocType,
  isDocType,
  presetFor,
  type DocType,
} from "@/lib/docTypes";
import type { ExtractedRecord } from "@/lib/types";
import { currentUserFromCookie } from "@/lib/session";
import { consumeDocumentQuota, formatResetDate } from "@/lib/usage";

export const config = { api: { bodyParser: false, responseLimit: false } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const user = await currentUserFromCookie(req.headers.cookie);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  // Documents land in the workspace the member is currently working in.
  const workspace = getActiveWorkspace(user);
  const chunks: Buffer[] = [];
  let bytes = 0;
  let tooLarge = false;
  req.on("data", (c) => {
    bytes += c.length;
    if (bytes > 12 * 1024 * 1024) tooLarge = true;
    else if (!tooLarge) chunks.push(Buffer.from(c));
  });
  req.on("end", async () => {
    try {
      if (tooLarge) { res.status(413).json({ error: "File must be smaller than 8 MB" }); return; }
      const raw = Buffer.concat(chunks).toString("utf-8");
      const body = JSON.parse(raw || "{}");
      if (typeof body.fileName !== "string" || body.fileName.length > 200 || typeof body.content !== "string" || typeof body.isBase64 !== "boolean") {
        res.status(400).json({ error: "Invalid upload details" }); return;
      }
      if (body.docType !== undefined && body.docType !== "auto" && !isDocType(body.docType)) {
        res.status(400).json({ error: "Unknown document type" }); return;
      }
      const fileName = body.fileName.replace(/[\\/\r\n\0]/g, "_");
      const extension = fileName.split(".").pop()?.toLowerCase();
      if (!extension || !["pdf", "txt", "jpg", "jpeg", "png", "webp"].includes(extension)) {
        res.status(415).json({ error: "Supported formats: PDF, TXT, JPG, PNG, WebP" }); return;
      }
      const content = body.content;
      const isBase64 = body.isBase64;

      if (content === undefined || content === null || String(content).length === 0) {
        res.status(400).json({ error: "No document content received" });
        return;
      }
      const fileSize = isBase64 ? Buffer.from(String(content), "base64").byteLength : Buffer.byteLength(String(content));
      if (fileSize > 8 * 1024 * 1024) { res.status(413).json({ error: "File must be smaller than 8 MB" }); return; }

      const fileBytes = isBase64
        ? Buffer.from(String(content), "base64")
        : Buffer.from(String(content), "utf-8");

      const text = await extractTextFromFile(fileName, String(content), isBase64);

      // An explicit choice wins; otherwise infer the type from filename and text.
      const docType: DocType =
        body.docType && body.docType !== "auto" ? body.docType : detectDocType(text, fileName);
      const preset = presetFor(docType);

      // Deduplicate by content hash, scoped to the document type.
      const hash = buildHash(text || String(content).slice(0, 8000), workspace.id, docType);
      const existing = getRecord(hash, workspace.id);
      // A failed record is re-attempted rather than reported as a duplicate, so retrying
      // a file from the batch actually re-runs extraction on the uploaded bytes.
      if (existing && existing.status !== "failed") {
        res.status(200).json({ ...existing, duplicate: true });
        return;
      }

      // Claim the monthly allowance before doing any work for this document, and
      // count it even if extraction later fails: the vision/LLM call is the cost
      // being metered. Duplicates are free and a retry re-runs an already-counted
      // document, so only genuinely new files consume the allowance.
      const { allowed, quota: usage } = consumeDocumentQuota(user);
      if (!allowed) {
        res.status(402).json({
          error: `Monthly limit reached — ${usage.used} of ${usage.limit} documents processed on the ${usage.planName} plan. Your allowance resets on ${formatResetDate(usage.resetsAt)}.`,
          quotaExceeded: true,
          plan: usage.plan,
          planName: usage.planName,
          used: usage.used,
          limit: usage.limit,
          resetsAt: usage.resetsAt,
        });
        return;
      }

      // Persist the original document bytes so the review page can show the PDF.
      saveDocument(hash, fileBytes).catch(() => {});

      // Start as "processing" so the UI shows a spinner immediately.
      const processingRecord: ExtractedRecord = {
        id: hash,
        userId: user.id,
        workspaceId: workspace.id,
        fileName,
        fileUrl: `/api/file/${hash}`,
        fileSize,
        uploadedAt: new Date().toISOString(),
        docType,
        fields: coerceFields(preset, {}),
        rows: [],
        status: "processing",
        rawText: text ? text.slice(0, 12000) : "[Extracted via Vision API]",
      };
      upsertRecord(processingRecord);
      recordActivity({
        workspaceId: workspace.id,
        record: processingRecord,
        actor: user,
        type: "uploaded",
        summary: `Uploaded ${fileName}`,
      });

      // Run structured extraction against the preset's fields.
      try {
        const { result, provider } = await extractStructured(fileName, String(content), isBase64, docType);
        const record: ExtractedRecord = {
          ...processingRecord,
          fields: result.fields,
          rows: result.rows,
          status: "extracted",
          demoMode: provider.demoMode,
        };
        upsertRecord(record);
        recordActivity({
          workspaceId: workspace.id,
          record,
          actor: user,
          type: "extracted",
          summary: provider.demoMode ? "Extraction finished (demo parsing)" : "Extraction finished",
        });
        res.status(201).json({ ...record, usage });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        const failedRecord: ExtractedRecord = {
          ...processingRecord,
          status: "failed",
          extractionError: errorMessage,
        };
        upsertRecord(failedRecord);
        recordActivity({
          workspaceId: workspace.id,
          record: failedRecord,
          actor: user,
          type: "extraction_failed",
          summary: `Extraction failed: ${errorMessage.slice(0, 160)}`,
        });
        res.status(500).json({ error: errorMessage, record: failedRecord, usage });
      }
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });
}
