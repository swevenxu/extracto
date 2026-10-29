import { createHash } from "crypto";
import {
  coerceFields,
  coerceRows,
  detectDocType,
  normalizeCurrency,
  presetFor,
  type DocType,
  type DocumentRow,
  type FieldValue,
} from "./docTypes";

const DATE = "(\\d{1,2}[\\/.-]\\d{1,2}[\\/.-]\\d{2,4}|\\d{4}-\\d{2}-\\d{2}|[A-Z][a-z]{2,8} \\d{1,2},? \\d{4})";
const MONEY = "[(]?[$€£¥]?\\s*-?[\\d,]+\\.\\d{2}[)]?";

function parseNumber(raw: string): number {
  const negative = /^\(.*\)$/.test(raw.trim());
  const cleaned = raw.replace(/[()]/g, "").replace(/[^\d.+-]/g, "");
  const n = parseFloat(cleaned);
  if (isNaN(n)) return 0;
  return negative ? -Math.abs(n) : n;
}

function firstMatch(text: string, patterns: RegExp[]): string | undefined {
  for (const re of patterns) {
    const m = text.match(re);
    if (m) return (m[1] ?? m[0]).trim();
  }
  return undefined;
}

function recognizeCurrency(text: string): string {
  return normalizeCurrency(undefined, text);
}

/** Lines that carry a total rather than a purchasable item. */
const SUMMARY_LINE = /^(?:sub\s*total|subtotal|tax|vat|gst|sales tax|grand\s*total|total|amount\s*due|amount\s*paid|balance\s*due|balance\s*paid|change\s*due|discount|shipping|tip|opening\s*balance|closing\s*balance|beginning\s*balance|ending\s*balance|balance\s*(?:brought|carried)\s*forward|new\s*balance)\b/i;

/** Item-style rows, shared by invoices and receipts. */
function itemRows(lines: string[]): DocumentRow[] {
  const rows: DocumentRow[] = [];
  for (const line of lines) {
    if (SUMMARY_LINE.test(line)) continue;

    const xQuantityMatch = line.match(/^(.+?)\s+x\s*([\d,.]+)\s+[$€£¥]?([\d,]+\.[0-9]{2})\s*$/i);
    if (xQuantityMatch) {
      const quantity = parseNumber(xQuantityMatch[2]);
      const amount = parseNumber(xQuantityMatch[3]);
      const description = xQuantityMatch[1].trim();
      if (description && quantity > 0) rows.push({ description, quantity, unitPrice: amount / quantity, amount });
      continue;
    }

    const quantityMatch = line.match(/^(.*?)\s*([\d,.]+)\s*[xX*]\s*[$€£¥]?([\d,]+\.[0-9]{2})(?:\s+[$€£¥]?([\d,]+\.[0-9]{2}))?\s*$/);
    if (quantityMatch) {
      const quantity = parseNumber(quantityMatch[2]);
      const unitPrice = parseNumber(quantityMatch[3]);
      const amount = quantityMatch[4] ? parseNumber(quantityMatch[4]) : quantity * unitPrice;
      const description = quantityMatch[1].replace(/[|,_-]/g, " ").trim();
      if (description && quantity > 0) rows.push({ description, quantity, unitPrice, amount });
      continue;
    }

    const priceMatch = line.match(/^(.*?)\s*([\d,]+\.[0-9]{2})\s*$/);
    if (!priceMatch) continue;
    const amount = parseNumber(priceMatch[2]);
    if (amount <= 0) continue;
    const description = priceMatch[1].replace(/[|,_-]/g, " ").replace(/\s+/g, " ").trim();
    if (description.length > 1) rows.push({ description, quantity: 1, unitPrice: amount, amount });
  }
  return rows;
}

function invoiceFields(text: string, lines: string[]): Record<string, FieldValue> {
  const vendor =
    firstMatch(text, [
      /(?:from|vendor|supplier|billing from|issued by)[:\s]+([A-Za-z0-9 &.',-]+)/i,
      /^([A-Za-z0-9 &.',-]+)$/m,
    ])?.trim() || "";

  const invoiceNumber =
    firstMatch(text, [
      /invoice\s*(?:no|number|#|num)?\s*[:#]?\s*([A-Za-z0-9/-]{3,20})/i,
      /(?:bill|invoice)\s*id\s*[:#]?\s*([A-Za-z0-9/-]{3,20})/i,
    ]) || "";

  const issueDate =
    firstMatch(text, [
      /(?:date|invoice date|issued?)\s*[:#]?\s*(\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})/i,
      new RegExp(DATE),
    ]) || "";

  const dueDate =
    firstMatch(text, [new RegExp(`(?:due|payment due|due date)\\s*[:#]?\\s*${DATE}`, "i")]) || "";

  const tax = parseNumber(
    firstMatch(text, [/(?:tax|vat|gst)\s*[:#]?\s*[$€£¥]?\s*([\d,]+\.[0-9]{2})/i]) || "0"
  );
  const subtotal = parseNumber(
    firstMatch(text, [/(?:sub\s*total|sub-total)\s*[:#]?\s*[$€£¥]?\s*([\d,]+\.[0-9]{2})/i]) || "0"
  );
  const total = parseNumber(
    firstMatch(text, [
      /(?:\bgrand total\b|\bamount due\b|\bbalance due\b|\btotal\b)\s*[:#]?\s*[$€£¥]?\s*([\d,]+\.[0-9]{2})/i,
    ]) || "0"
  );

  const rows = itemRows(lines);
  return {
    vendor: vendor || firstLine(lines),
    invoiceNumber,
    issueDate,
    dueDate,
    currency: recognizeCurrency(lines.join(" | ")),
    subtotal,
    tax,
    total: total || rows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0),
  };
}

function firstLine(lines: string[]): string {
  const first = lines.find((line) => /^[A-Za-z0-9 &.',-]{3,60}$/.test(line));
  return first ?? "";
}

function receiptFields(text: string, lines: string[]): Record<string, FieldValue> {
  const merchant =
    firstMatch(text, [
      /(?:merchant|store|shop|sold by|seller)\s*[:#-]?\s*([A-Za-z0-9 &.',-]{2,60})/i,
      /^([A-Za-z0-9 &.',-]{3,60})$/m,
    ]) || "";

  const receiptNumber =
    firstMatch(text, [
      /receipt\s*(?:no|number|#|num)?\s*[:#]?\s*([A-Za-z0-9/-]{3,30})/i,
      /(?:transaction|order|reference)\s*(?:no|number|#|id)?\s*[:#]?\s*([A-Za-z0-9/-]{3,30})/i,
    ]) || "";

  const purchaseDate =
    firstMatch(text, [
      new RegExp(`(?:purchase date|date|purchased|transaction date)\\s*[:#]?\\s*${DATE}`, "i"),
      new RegExp(DATE),
    ]) || "";

  const paymentMethod =
    firstMatch(text, [
      /(?:payment method|paid (?:by|with)|tender(?:ed)?)\s*[:#-]?\s*([A-Za-z0-9 &*.-]{2,40})/i,
      /(visa|mastercard|master card|amex|american express|discover|debit card|credit card|cash|gcash|paypal|apple pay|google pay)/i,
    ]) || "";

  const tax = parseNumber(
    firstMatch(text, [/(?:tax|vat|gst|sales tax)\s*[:#]?\s*[$€£¥]?\s*([\d,]+\.[0-9]{2})/i]) || "0"
  );
  const total = parseNumber(
    firstMatch(text, [
      /(?:\btotal\b|\bamount paid\b|\bamount tendered\b|\bbalance paid\b|\btotal paid\b)\s*[:#]?\s*[$€£¥]?\s*([\d,]+\.[0-9]{2})/i,
    ]) || "0"
  );

  const rows = itemRows(lines);
  return {
    merchant: merchant || firstLine(lines),
    receiptNumber,
    purchaseDate,
    paymentMethod,
    currency: recognizeCurrency(lines.join(" | ")),
    tax,
    total: total || rows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0),
  };
}

const BANK_SUMMARY_LINE = /^(?:opening|closing|beginning|ending|old|new)\s*balance|^\s*balance\s*(?:brought|carried)\s*forward|^\s*(?:total|subtotal)\b/i;

function bankStatementFields(text: string, lines: string[]): Record<string, FieldValue> {
  const bankName =
    firstMatch(text, [
      /(?:^|\n)\s*([A-Za-z0-9 &.'-]{2,40}(?:bank|credit union|savings|trust|financial))/i,
      /(?:bank|institution)\s*(?:name)?\s*[:\-]\s*([A-Za-z0-9 &.'-]{2,60})/i,
    ]) || firstLine(lines);

  const accountName =
    firstMatch(text, [/account\s*(?:holder|name|owner)\s*[:\-]\s*([A-Za-z0-9 &.'-]{2,60})/i]) || "";

  const accountNumber =
    firstMatch(text, [
      /(?:account|acct)\.?\s*(?:no|number|#)\s*[:\-]?\s*([Xx*•\d][\d\s*Xx•-]{2,30})/i,
    ])?.replace(/\s+/g, " ") || "";

  const periodStart =
    firstMatch(text, [
      new RegExp(`(?:statement period|period|statement dates?)\\s*[:\\-]?\\s*${DATE}`, "i"),
      new RegExp(`from\\s+${DATE}`, "i"),
    ]) || "";

  const periodEnd =
    firstMatch(text, [
      new RegExp(`(?:statement period|period|statement dates?)\\s*[:\\-]?\\s*${DATE}\\s*(?:to|through|until|-|–)\\s*${DATE}`, "i"),
      new RegExp(`(?:to|through|until)\\s+${DATE}`, "i"),
    ]) || "";

  // The period-end pattern above captures the range; re-read it to grab the close.
  const range = text.match(
    new RegExp(`(?:statement period|period|statement dates?)\\s*[:\\-]?\\s*${DATE}\\s*(?:to|through|until|-|–)\\s*${DATE}`, "i")
  );
  const startValue = range?.[1] ?? periodStart;
  const endValue = range?.[2] ?? periodEnd;

  const openingBalance = parseNumber(
    firstMatch(text, [
      new RegExp(`(?:opening|beginning)\\s*balance\\s*[:\\-]?\\s*(${MONEY})`, "i"),
      new RegExp(`balance\\s*(?:brought|carried)\\s*forward\\s*[:\\-]?\\s*(${MONEY})`, "i"),
    ]) || "0"
  );

  const closingBalance = parseNumber(
    firstMatch(text, [
      new RegExp(`(?:closing|ending|new)\\s*balance\\s*[:\\-]?\\s*(${MONEY})`, "i"),
      new RegExp(`balance\\s*(?:carried|c/f)\\s*forward\\s*[:\\-]?\\s*(${MONEY})`, "i"),
    ]) || "0"
  );

  return {
    bankName,
    accountName,
    accountNumber,
    currency: recognizeCurrency(lines.join(" | ")),
    periodStart: startValue,
    periodEnd: endValue,
    openingBalance,
    closingBalance,
  };
}

function bankRows(lines: string[]): DocumentRow[] {
  const rows: DocumentRow[] = [];
  const transaction = new RegExp(
    `^${DATE}\\s+(.+?)\\s+(${MONEY})(?:\\s+(${MONEY}))?$`,
    "i"
  );
  for (const line of lines) {
    if (BANK_SUMMARY_LINE.test(line)) continue;
    const match = line.match(transaction);
    if (!match) continue;
    const description = match[2].replace(/[|,_]/g, " ").replace(/\s+/g, " ").trim();
    if (!description) continue;
    rows.push({
      date: match[1],
      description,
      amount: parseNumber(match[3]),
      balance: match[4] ? parseNumber(match[4]) : 0,
    });
  }
  return rows;
}

export interface DemoExtraction {
  fields: Record<string, FieldValue>;
  rows: DocumentRow[];
}

/**
 * Rule-based extraction for a given document type. This is the demo/no-provider
 * path and the fallback the AI path is validated against.
 */
export function extractFromText(
  rawText: string,
  fileName?: string,
  docType?: DocType
): DemoExtraction {
  const text = rawText.replace(/\r/g, "").replace(/\n{3,}/g, "\n");
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const type = docType ?? detectDocType(text, fileName ?? "");
  const preset = presetFor(type);

  const fields =
    type === "bank_statement"
      ? bankStatementFields(text, lines)
      : type === "receipt"
        ? receiptFields(text, lines)
        : invoiceFields(text, lines);

  const rows = type === "bank_statement" ? bankRows(lines) : itemRows(lines);

  return {
    fields: coerceFields(preset, fields),
    rows: coerceRows(preset, rows),
  };
}

/** Content hash used for de-duplication; the type is part of a document's identity. */
export function buildHash(text: string, userId = "", docType: DocType = "invoice"): string {
  return createHash("sha256").update(`${userId}\0${docType}\0${text}`).digest("hex").slice(0, 24);
}
