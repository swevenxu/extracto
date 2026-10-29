/** How much text we need before structured extraction is worth running. */
const MIN_CHARS = 40;
const MIN_LETTER_RATIO = 0.25;

export type DocumentTextQuality = "ok" | "empty" | "garbage";

export function assessDocumentText(text: string): DocumentTextQuality {
  const trimmed = text.replace(/\u0000/g, "").trim();
  if (!trimmed) return "empty";
  const letters = (trimmed.match(/\p{L}/gu) || []).length;
  if (trimmed.length < MIN_CHARS || letters / trimmed.length < MIN_LETTER_RATIO) return "garbage";
  return "ok";
}

/** User-facing reason when text extraction cannot feed the LLM/regex path. */
export function unusableDocumentTextMessage(quality: Exclude<DocumentTextQuality, "ok">): string {
  if (quality === "empty") {
    return "No text layer found. For scanned documents or images, configure an AI vision provider (GEMINI_API_KEY or OPENAI_API_KEY).";
  }
  return "Extracted text looks unusable. For scanned documents, configure an AI vision provider (GEMINI_API_KEY or OPENAI_API_KEY).";
}
