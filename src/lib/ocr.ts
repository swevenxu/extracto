import {
  coerceFields,
  coerceRows,
  detectDocType,
  presetFor,
  type DocPreset,
  type DocType,
  type DocumentRow,
  type FieldValue,
} from "./docTypes";
import { extractFromText } from "./extractor";
import { extractTextFromFile } from "./extractText";
import {
  assessDocumentText,
  unusableDocumentTextMessage,
  type DocumentTextQuality,
} from "./documentText";

/**
 * OCR provider interface.
 *
 * `extractStructured` is the single entry point for turning an uploaded file
 * into a structured record. Implementations:
 *  - Gemini or OpenAI (structured extraction from document text)
 *  - Demo mode (deterministic regex extraction, clearly labeled)
 *
 * The requested document type selects the field set and line-table shape the
 * provider is asked to return.
 *
 * Credentials are read from environment variables; if none are present the
 * service runs in demo mode and every result is labeled with `demoMode: true`.
 */

export interface ProviderInfo {
  provider: "gemini" | "openai" | "demo";
  hasCredentials: boolean;
  demoMode: boolean;
}

export interface ExtractionPayload {
  fields: Record<string, FieldValue>;
  rows: DocumentRow[];
}

export function getProviderInfo(): ProviderInfo {
  const provider = (process.env.OCR_PROVIDER || "gemini").toLowerCase();
  if (provider === "demo") return { provider: "demo", hasCredentials: false, demoMode: true };
  if (provider === "openai") return { provider, hasCredentials: Boolean(process.env.OPENAI_API_KEY), demoMode: false };
  return { provider: "gemini", hasCredentials: Boolean(process.env.GEMINI_API_KEY), demoMode: false };
}

function schemaFor(preset: DocPreset) {
  const fieldProperties = Object.fromEntries(
    preset.fields.map((field) => [field.key, { type: field.kind === "number" ? "NUMBER" : "STRING" }])
  );
  const rowProperties = Object.fromEntries(
    preset.rowColumns.map((column) => [column.key, { type: column.kind === "number" ? "NUMBER" : "STRING" }])
  );
  return {
    type: "OBJECT",
    properties: {
      ...fieldProperties,
      rows: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: rowProperties,
          required: preset.rowColumns.map((column) => column.key),
        },
      },
    },
    required: [...preset.fields.map((field) => field.key), "rows"],
  };
}

function promptFor(preset: DocPreset): string {
  const fields = preset.fields.map((field) => `${field.key} (${field.label})`).join(", ");
  const rows = preset.rowColumns.map((column) => `${column.key} (${column.label})`).join(", ");
  return [
    `Extract ${preset.label.toLowerCase()} fields faithfully from the provided document.`,
    "Do not infer missing values. Use empty strings for missing text and 0 for missing numbers.",
    "Use ISO 4217 codes for currency. Keep rows in document order.",
    preset.id === "bank_statement"
      ? "Amounts may be negative for withdrawals; balance is the running balance after each transaction."
      : "Keep line rows in document order.",
    `Return keys: ${fields}.`,
    `Return rows as an array of objects with keys: ${rows}.`,
    "Return only the requested structured data.",
  ].join(" ");
}

function parseModelResult(content: string, preset: DocPreset): ExtractionPayload {
  const data = JSON.parse(content) as Record<string, unknown>;
  return {
    fields: coerceFields(preset, data),
    rows: coerceRows(preset, data.rows),
  };
}

const EXTRACTION_TIMEOUT_MS = 15_000;

async function extractViaOpenAI(text: string, preset: DocPreset): Promise<ExtractionPayload> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is required when OCR_PROVIDER=openai");
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: promptFor(preset) },
        { role: "user", content: `Document text:\n\n${text}` },
      ],
    }),
  });
  if (!response.ok) throw new Error(`OpenAI API error ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const json = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenAI returned an empty response");
  return parseModelResult(content, preset);
}

async function extractViaGemini(text: string, preset: DocPreset): Promise<ExtractionPayload> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is required when OCR_PROVIDER=gemini");
  const model = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
  let interaction: {
    id?: string;
    status?: string;
    output_text?: string;
    steps?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
    errors?: Array<{ message?: string }>;
  };
  try {
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      signal: AbortSignal.timeout(EXTRACTION_TIMEOUT_MS),
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        model,
        input: `${promptFor(preset)}\n\nExtract the data from this text:\n\n${text}`,
        generation_config: { thinking_level: "minimal" },
        response_format: [{ type: "text", mime_type: "application/json", schema: schemaFor(preset) }],
        background: true,
      }),
    });
    interaction = await response.json();
    if (!response.ok) {
      throw new Error(`Gemini API error ${response.status}: ${interaction.errors?.[0]?.message || "request rejected"}`);
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new Error("Gemini did not accept the request in time. Please try again.");
    }
    throw error;
  }
  const deadline = Date.now() + 60_000;
  while (interaction.status === "in_progress" && interaction.id && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1_200));
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/interactions/${encodeURIComponent(interaction.id)}`, {
      headers: { "x-goog-api-key": apiKey },
      signal: AbortSignal.timeout(10_000),
    });
    interaction = await response.json();
    if (!response.ok) throw new Error(`Gemini status check failed (${response.status})`);
  }
  if (interaction.status === "in_progress") throw new Error("Gemini is still processing this document. Please try again shortly.");
  if (interaction.status === "failed") throw new Error(`Gemini extraction failed: ${interaction.errors?.[0]?.message || "provider error"}`);
  const content = interaction.output_text || interaction.steps
    ?.filter((step) => step.type === "model_output")
    .flatMap((step) => step.content || [])
    .filter((part) => part.type === "text")
    .map((part) => part.text || "")
    .join("");
  if (!content) throw new Error("Gemini returned an empty response");
  return parseModelResult(content, preset);
}

function getMimeType(fileName: string): string {
  const ext = (fileName.split(".").pop() || "").toLowerCase();
  const map: Record<string, string> = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
  return map[ext] || "application/octet-stream";
}

async function extractViaGeminiVision(fileBuffer: Buffer, mimeType: string, preset: DocPreset): Promise<ExtractionPayload> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is required for image/scanned document extraction");
  const model = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({
        contents: [{ parts: [
          { text: promptFor(preset) },
          { inlineData: { mimeType, data: fileBuffer.toString("base64") } },
        ] }],
        generationConfig: { responseMimeType: "application/json", responseSchema: schemaFor(preset) },
      }),
    },
  );
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gemini vision error ${response.status}: ${body.slice(0, 200)}`);
  }
  const json = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini vision returned an empty response");
  return parseModelResult(text, preset);
}

async function extractViaOpenAIVision(fileBuffer: Buffer, mimeType: string, preset: DocPreset): Promise<ExtractionPayload> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is required for image extraction");
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const dataUri = `data:${mimeType};base64,${fileBuffer.toString("base64")}`;
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: promptFor(preset) },
        {
          role: "user",
          content: [
            { type: "text", text: `Extract the ${preset.label.toLowerCase()} data from this image.` },
            { type: "image_url", image_url: { url: dataUri } },
          ],
        },
      ],
    }),
  });
  if (!response.ok) throw new Error(`OpenAI API error ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const json = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenAI returned an empty response");
  return parseModelResult(content, preset);
}

export async function extractStructuredFromText(
  text: string,
  docType: DocType = "invoice"
): Promise<{ result: ExtractionPayload; provider: ProviderInfo; docType: DocType }> {
  const preset = presetFor(docType);
  const provider = getProviderInfo();
  if (provider.provider === "demo") {
    return { result: extractFromText(text, undefined, preset.id), provider, docType: preset.id };
  }
  const result = provider.provider === "gemini"
    ? await extractViaGemini(text, preset)
    : await extractViaOpenAI(text, preset);
  return { result, provider, docType: preset.id };
}

/**
 * Run structured extraction for an uploaded file.
 * Text-layer first; falls back to vision for images and scanned PDFs.
 */
export async function extractStructured(
  fileName: string,
  content: string | Buffer,
  isBase64 = false,
  docType?: DocType
): Promise<{ result: ExtractionPayload; provider: ProviderInfo; docType: DocType }> {
  const text = await extractTextFromFile(fileName, content, isBase64);
  const type = docType ?? detectDocType(text, fileName);
  const preset = presetFor(type);
  const quality = assessDocumentText(text);
  const provider = getProviderInfo();

  // Good text → use text-based extraction (AI or regex)
  if (quality === "ok") {
    return extractStructuredFromText(text, preset.id);
  }

  // Text unusable → try vision for images and scanned PDFs
  const mimeType = getMimeType(fileName);
  const buf = typeof content === "string"
    ? isBase64 ? Buffer.from(content, "base64") : Buffer.from(content, "utf-8")
    : content;

  if (provider.provider === "gemini" && provider.hasCredentials) {
    const result = await extractViaGeminiVision(buf, mimeType, preset);
    return { result, provider, docType: preset.id };
  }

  if (provider.provider === "openai" && provider.hasCredentials && mimeType.startsWith("image/")) {
    const result = await extractViaOpenAIVision(buf, mimeType, preset);
    return { result, provider, docType: preset.id };
  }

  // No vision fallback available
  throw new Error(unusableDocumentTextMessage(quality as Exclude<DocumentTextQuality, "ok">));
}
