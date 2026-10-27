import type { Currency, ExtractedRecord, LineItem } from "./types";
import { extractFromText } from "./extractor";
import { extractTextFromFile } from "./extractText";

/**
 * OCR provider interface.
 *
 * `extractStructured` is the single entry point for turning an uploaded file
 * into a structured record. Implementations:
 *  - Gemini or OpenAI (structured extraction from document text)
 *  - Demo mode (deterministic regex extraction, clearly labeled)
 *
 * Credentials are read from environment variables; if none are present the
 * service runs in demo mode and every result is labeled with `demoMode: true`.
 */

export interface ProviderInfo {
  provider: "gemini" | "openai" | "demo";
  hasCredentials: boolean;
  demoMode: boolean;
}

export interface ExtractionResult {
  vendor?: string;
  invoiceNumber?: string;
  issueDate?: string;
  dueDate?: string;
  currency: Currency;
  subtotal: number;
  tax: number;
  total: number;
  lineItems: LineItem[];
}

export function getProviderInfo(): ProviderInfo {
  const provider = (process.env.OCR_PROVIDER || "gemini").toLowerCase();
  if (provider === "demo") return { provider: "demo", hasCredentials: false, demoMode: true };
  if (provider === "openai") return { provider, hasCredentials: Boolean(process.env.OPENAI_API_KEY), demoMode: false };
  return { provider: "gemini", hasCredentials: Boolean(process.env.GEMINI_API_KEY), demoMode: false };
}

function extractViaRegex(text: string): ExtractionResult {
  const parsed = extractFromText(text);
  return {
    vendor: parsed.vendor,
    invoiceNumber: parsed.invoiceNumber,
    issueDate: parsed.issueDate,
    dueDate: parsed.dueDate,
    currency: parsed.currency,
    subtotal: parsed.subtotal,
    tax: parsed.tax,
    total: parsed.total,
    lineItems: parsed.lineItems,
  };
}

function parseModelResult(content: string): ExtractionResult {
  const data = JSON.parse(content) as Partial<ExtractionResult> & { lineItems?: unknown };
  const numeric = (value: unknown) => {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 && n <= 1_000_000_000 ? n : 0;
  };
  const lineItems: LineItem[] = Array.isArray(data.lineItems)
    ? data.lineItems.slice(0, 500).filter((li) => li && typeof li === "object").map((li: Partial<LineItem>) => ({
        description: typeof li.description === "string" ? li.description.slice(0, 500) : "",
        quantity: numeric(li.quantity),
        unitPrice: numeric(li.unitPrice),
        amount: numeric(li.amount),
      }))
    : [];
  const currency = ["USD", "EUR", "GBP", "JPY", "CAD", "AUD", "PHP"].includes(String(data.currency).toUpperCase()) ? String(data.currency).toUpperCase() as Currency : "USD";
  return {
    vendor: typeof data.vendor === "string" ? data.vendor.slice(0, 500) : undefined,
    invoiceNumber: typeof data.invoiceNumber === "string" ? data.invoiceNumber.slice(0, 100) : undefined,
    issueDate: typeof data.issueDate === "string" ? data.issueDate.slice(0, 50) : undefined,
    dueDate: typeof data.dueDate === "string" ? data.dueDate.slice(0, 50) : undefined,
    currency,
    subtotal: numeric(data.subtotal),
    tax: numeric(data.tax),
    total: numeric(data.total),
    lineItems,
  };
}

const extractionSchema = {
  type: "OBJECT",
  properties: {
    vendor: { type: "STRING" },
    invoiceNumber: { type: "STRING" },
    issueDate: { type: "STRING" },
    dueDate: { type: "STRING" },
    currency: { type: "STRING", enum: ["USD", "EUR", "GBP", "JPY", "CAD", "AUD", "PHP"] },
    subtotal: { type: "NUMBER" },
    tax: { type: "NUMBER" },
    total: { type: "NUMBER" },
    lineItems: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          description: { type: "STRING" },
          quantity: { type: "NUMBER" },
          unitPrice: { type: "NUMBER" },
          amount: { type: "NUMBER" },
        },
        required: ["description", "quantity", "unitPrice", "amount"],
      },
    },
  },
  required: ["vendor", "invoiceNumber", "issueDate", "dueDate", "currency", "subtotal", "tax", "total", "lineItems"],
};

const extractionPrompt = "Extract invoice or receipt fields faithfully from the provided document text. Do not infer missing values. Use empty strings for missing text and 0 for missing numbers. Keep line items in document order. Return only the requested structured data.";

async function extractViaOpenAI(text: string): Promise<ExtractionResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is required when OCR_PROVIDER=openai");
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `${extractionPrompt} Use keys: vendor, invoiceNumber, issueDate, dueDate, currency, subtotal, tax, total, lineItems (description, quantity, unitPrice, amount).` },
        { role: "user", content: `Document text:\n\n${text}` },
      ],
    }),
  });
  if (!response.ok) throw new Error(`OpenAI API error ${response.status}: ${(await response.text()).slice(0, 200)}`);
  const json = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenAI returned an empty response");
  return parseModelResult(content);
}

async function extractViaGemini(text: string): Promise<ExtractionResult> {
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
      signal: AbortSignal.timeout(15_000),
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        model,
        input: `${extractionPrompt}\n\nExtract invoice/receipt data from this text:\n\n${text}`,
        generation_config: { thinking_level: "minimal" },
        response_format: [{ type: "text", mime_type: "application/json", schema: extractionSchema }],
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
  return parseModelResult(content);
}

export async function extractStructuredFromText(text: string): Promise<{ result: ExtractionResult; provider: ProviderInfo }> {
  const provider = getProviderInfo();
  const result = provider.provider === "demo"
    ? extractViaRegex(text)
    : provider.provider === "gemini"
      ? await extractViaGemini(text)
      : await extractViaOpenAI(text);
  return { result, provider };
}

/**
 * Run structured extraction for an uploaded file.
 * Returns the extraction result plus provider metadata for labeling.
 */
export async function extractStructured(
  fileName: string,
  content: string | Buffer,
  isBase64 = false
): Promise<{ result: ExtractionResult; provider: ProviderInfo }> {
  const text = await extractTextFromFile(fileName, content, isBase64);
  return extractStructuredFromText(text);
}
