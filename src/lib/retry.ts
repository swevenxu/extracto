import { extractStructuredFromText } from "./ocr";
import { getActiveWorkspace, getRecord, upsertRecord } from "./storage";
import { recordActivity } from "./audit";
import type { ExtractedRecord, User } from "./types";

/**
 * Re-run extraction for a stored record using its rawText, keeping the document
 * type (and therefore its field preset) it was created with. The retry is
 * recorded in the document history against the acting member.
 */
export async function retryExtraction(id: string, user: User): Promise<ExtractedRecord> {
  const workspace = getActiveWorkspace(user);
  const record = getRecord(id, workspace.id);
  if (!record) throw new Error("Record not found");

  const text = record.rawText || "";
  if (!text.trim() || text.startsWith("[Extracted via Vision")) {
    throw new Error("Cannot retry vision-based extraction without re-uploading the file");
  }

  const processing: ExtractedRecord = {
    ...record,
    status: "processing",
    extractionError: undefined,
    updatedBy: user.id,
    updatedAt: new Date().toISOString(),
  };
  upsertRecord(processing);

  try {
    const { result, provider } = await extractStructuredFromText(text, record.docType);
    const updated: ExtractedRecord = {
      ...processing,
      fields: result.fields,
      rows: result.rows,
      status: "extracted",
      demoMode: provider.demoMode,
    };
    upsertRecord(updated);
    recordActivity({
      workspaceId: workspace.id,
      record,
      actor: user,
      type: "retried",
      summary: "Re-ran extraction",
    });
    return updated;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const failed: ExtractedRecord = { ...processing, status: "failed", extractionError: message };
    upsertRecord(failed);
    recordActivity({
      workspaceId: workspace.id,
      record,
      actor: user,
      type: "extraction_failed",
      summary: `Retry failed: ${message.slice(0, 160)}`,
    });
    return failed;
  }
}
