import { createHash, randomUUID } from "crypto";
import type { Currency, ExtractedRecord, LineItem } from "./types";

const CURRENCY_MAP: Record<string, Currency> = {
  usd: "USD",
  "$": "USD",
  us$: "USD",
  eur: "EUR",
  "€": "EUR",
  gbp: "GBP",
  "£": "GBP",
  jpy: "JPY",
  "¥": "JPY",
  cad: "CAD",
  aud: "AUD",
  php: "PHP",
  "₱": "PHP",
  "ph peso": "PHP",
  "philippine peso": "PHP",
};

function recognizeCurrency(text: string): Currency {
  for (const [key, code] of Object.entries(CURRENCY_MAP)) {
    const pattern = /[$€£¥]/.test(key) ? key.replace(/[$€£¥]/g, "\\$&") : `\\b${key}\\b`;
    if (new RegExp(pattern, "i").test(text)) {
      return code;
    }
  }
  // fall back on unicode currency symbols not in map
  if (text.includes("$")) return "USD";
  return "USD";
}

function parseNumber(raw: string): number {
  const cleaned = raw.replace(/[^\d.+-]/g, "");
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

function firstMatch(text: string, patterns: RegExp[]): string | undefined {
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return m[1] ?? m[0];
  }
  return undefined;
}

export function extractFromText(
  rawText: string,
  fileName?: string,
): Omit<ExtractedRecord, "id" | "userId" | "fileName" | "fileSize" | "uploadedAt" | "status"> {
  const text = rawText.replace(/\r/g, "").replace(/\n{3,}/g, "\n");
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const joined = lines.join(" | ");

  const vendor =
    firstMatch(text, [
      /(?:from|vendor|supplier|billing from|issued by)[:\s]+([A-Za-z0-9 &.',-]+)/i,
      /^([A-Za-z0-9 &.',-]+)$/m,
    ])?.trim() || undefined;

  const invoiceNumber =
    firstMatch(text, [
      /(?:invoice\s*(?:no|number|#|num)?\s*[:#]?\s*)([A-Za-z0-9/-]{3,20})/i,
      /(?:receipt\s*(?:no|number|#)?\s*[:#]?\s*)([A-Za-z0-9/-]{3,20})/i,
    ])?.trim() || undefined;

  const issueDate =
    firstMatch(text, [
      /(?:date|invoice date|issued?)\s*[:#]?\s*(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})/i,
      /(\d{4}-\d{2}-\d{2})/,
      /\b(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})\b/,
    ])?.trim() || undefined;

  const dueDate =
    firstMatch(text, [
      /(?:due|payment due|due date)\s*[:#]?\s*(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})/i,
    ])?.trim() || undefined;

  const currency = recognizeCurrency(joined);

  const tax =
    parseNumber(firstMatch(text, [
      /(?:tax|vat|gst)\s*[:#]?\s*[$€£¥]?\s*([\d,]+\.?\d*)/i,
    ]) || "0");

  const subtotal =
    parseNumber(firstMatch(text, [
      /(?:subtotal|sub total|sub-total)\s*[:#]?\s*[$€£¥]?\s*([\d,]+\.?\d*)/i,
    ]) || "0");

  const total =
    parseNumber(firstMatch(text, [
      /(?:\bgrand total\b|\bamount due\b|\bbalance due\b|\btotal\b)\s*[:#]?\s*[$€£¥]?\s*([\d,]+\.?\d*)/i,
    ]) || "0");

  // Line items: prefer rows with a price column; fall back to scanning numbers.
  const lineItems: LineItem[] = [];
  for (const line of lines) {
    if (/^(?:sub\s*total|tax|vat|gst|grand\s*total|total|amount\s*due|balance\s*due|discount|shipping)\b/i.test(line)) continue;
    const xQuantityMatch = line.match(/\bx\s*([\d,.]+)\s+[$€£¥]?([\d,]+\.\d{2})\s*$/i);
    if (xQuantityMatch) {
      const quantity = parseNumber(xQuantityMatch[1]);
      const amount = parseNumber(xQuantityMatch[2]);
      const description = line.slice(0, xQuantityMatch.index).trim();
      if (description && quantity > 0) lineItems.push({ description, quantity, unitPrice: amount / quantity, amount });
      continue;
    }
    const quantityMatch = line.match(/([\d,.]+)\s*[xX*]\s*[$€£¥]?([\d,]+\.\d{2})(?:\s+[$€£¥]?([\d,]+\.\d{2}))?\s*$/);
    if (quantityMatch) {
      const quantity = parseNumber(quantityMatch[1]);
      const unitPrice = parseNumber(quantityMatch[2]);
      const amount = quantityMatch[3] ? parseNumber(quantityMatch[3]) : quantity * unitPrice;
      const description = line.slice(0, quantityMatch.index).replace(/[|,_-]/g, " ").trim();
      if (description && quantity > 0) lineItems.push({ description, quantity, unitPrice, amount });
      continue;
    }
    const priceMatch = line.match(/([\d,]+\.\d{2})\s*$/);
    if (!priceMatch) continue;
    const amount = parseNumber(priceMatch[1]);
    if (amount <= 0) continue;
    const description = line
      .replace(/([\d,]+\.\d{2})\s*$/, "")
      .replace(/[|,_-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (description.length > 1) {
      lineItems.push({ description, quantity: 1, unitPrice: amount, amount });
    }
  }

  // Cautious guess: vendor from filename if not found elsewhere.
  const vendorFromFile = fileName
    ? fileName
        .replace(/\.(pdf|jpg|jpeg|png|txt)$/i, "")
        .replace(/[_-]+/g, " ")
        .trim()
    : undefined;

  return {
    vendor: vendor || (vendorFromFile && vendorFromFile.length > 2 ? vendorFromFile : undefined),
    invoiceNumber,
    issueDate,
    dueDate,
    currency,
    subtotal,
    tax,
    total: total || lineItems.reduce((s, li) => s + li.amount, 0),
    lineItems,
    rawText: text.slice(0, 12000),
  };
}

export function buildRecord(input: {
  userId: string;
  fileName: string;
  fileSize: number;
  rawText: string;
}): ExtractedRecord {
  const extracted = extractFromText(input.rawText, input.fileName);
  return {
    ...extracted,
    id: randomUUID(),
    userId: input.userId,
    fileName: input.fileName,
    fileSize: input.fileSize,
    uploadedAt: new Date().toISOString(),
    status: "extracted",
  };
}

export function buildHash(text: string, userId = ""): string {
  return createHash("sha256").update(`${userId}\0${text}`).digest("hex").slice(0, 24);
}
