import { extractStructuredFromText } from "./ocr";
import { getRecord, upsertRecord } from "./storage";
import type { ExtractedRecord } from "./types";

/**
 * Re-run extraction for a stored record using its rawText.
 * Updates status/error fields and returns the updated record.
 */
export async function retryExtraction(id: string, userId: string): Promise<ExtractedRecord> {
  const record = getRecord(id, userId);
  if (!record) throw new Error("Record not found");

  const text = record.rawText || "";
  if (!text.trim()) throw new Error("No raw text stored for this record");

  const processing: ExtractedRecord = { ...record, status: "processing", extractionError: undefined };
  upsertRecord(processing);

  try {
    const { result, provider } = await extractStructuredFromText(text);
    const updated: ExtractedRecord = {
      ...processing,
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
    upsertRecord(updated);
    return updated;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const failed: ExtractedRecord = { ...processing, status: "failed", extractionError: message };
    upsertRecord(failed);
    return failed;
  }
}
