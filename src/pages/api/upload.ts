import { buildHash } from "@/lib/extractor";
import { extractStructured } from "@/lib/ocr";
import { extractTextFromFile } from "@/lib/extractText";
import { getRecord, upsertRecord } from "@/lib/storage";
import type { ExtractedRecord } from "@/lib/types";
import { currentUserFromCookie } from "@/lib/session";

export const config = { api: { bodyParser: false, responseLimit: false } };

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const user = await currentUserFromCookie(req.headers.cookie);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
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
      const fileName = body.fileName.replace(/[\\/\r\n\0]/g, "_");
      const extension = fileName.split(".").pop()?.toLowerCase();
      if (!extension || !["pdf", "txt"].includes(extension)) {
        res.status(415).json({ error: "Only text-based PDF and TXT files are supported currently" }); return;
      }
      const content = body.content;
      const isBase64 = body.isBase64;

      if (content === undefined || content === null || String(content).length === 0) {
        res.status(400).json({ error: "No document content received" });
        return;
      }
      const fileSize = isBase64 ? Buffer.from(String(content), "base64").byteLength : Buffer.byteLength(String(content));
      if (fileSize > 8 * 1024 * 1024) { res.status(413).json({ error: "File must be smaller than 8 MB" }); return; }

      const text = await extractTextFromFile(fileName, String(content), isBase64);
      if (!text.trim()) {
        res.status(400).json({ error: "Could not extract text from document" });
        return;
      }

      // Deduplicate by content hash.
      const hash = buildHash(text, user.id);
      const existing = getRecord(hash, user.id);
      if (existing) {
        res.status(200).json({ ...existing, duplicate: true });
        return;
      }

      // Start as "processing" so the UI shows a spinner immediately.
      const processingRecord: ExtractedRecord = {
        id: hash,
        userId: user.id,
        fileName,
        fileSize,
        uploadedAt: new Date().toISOString(),
        vendor: undefined,
        invoiceNumber: undefined,
        issueDate: undefined,
        dueDate: undefined,
        currency: "USD",
        subtotal: 0,
        tax: 0,
        total: 0,
        lineItems: [],
        status: "processing",
        rawText: text.slice(0, 12000),
      };
      upsertRecord(processingRecord);

      // Run structured extraction.
      try {
        const { result, provider } = await extractStructured(fileName, String(content), isBase64);
        const record: ExtractedRecord = {
          ...processingRecord,
          vendor: result.vendor,
          invoiceNumber: result.invoiceNumber,
          issueDate: result.issueDate,
          dueDate: result.dueDate,
          currency: result.currency,
          subtotal: result.subtotal,
          tax: result.tax,
          total: result.total,
          lineItems: result.lineItems,
          status: "extracted",
          demoMode: provider.demoMode,
        };
        upsertRecord(record);
        res.status(201).json(record);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        const failedRecord: ExtractedRecord = {
          ...processingRecord,
          status: "failed",
          extractionError: errorMessage,
        };
        upsertRecord(failedRecord);
        res.status(500).json({ error: errorMessage, record: failedRecord });
      }
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });
}
