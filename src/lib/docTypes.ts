/**
 * Document presets.
 *
 * Each supported document type declares the fields it actually has and the shape
 * of its line table, so an invoice is not forced onto a receipt and a bank
 * statement is not forced into invoice fields.
 */

export type DocType = "invoice" | "receipt" | "bank_statement";
export type FieldKind = "text" | "date" | "number";

export type FieldValue = string | number;
export type DocumentRow = Record<string, FieldValue>;

export interface FieldDef {
  key: string;
  label: string;
  kind: FieldKind;
  /** Spans both columns of the review field grid. */
  wide?: boolean;
}

export interface RowColumnDef {
  key: string;
  label: string;
  kind: FieldKind;
}

export interface DocPreset {
  id: DocType;
  label: string;
  plural: string;
  description: string;
  fields: FieldDef[];
  rowColumns: RowColumnDef[];
  rowHeading: string;
  addRowLabel: string;
  emptyRowLabel: string;
  rowTotalLabel: string;
  /** Field shown under the filename in the ledger. */
  subtitleKey: string;
  /** Field used as the document's identifier in the ledger. */
  referenceKey: string;
  referenceLabel: string;
  /** Field used as the document's date in the ledger. */
  dateKey: string;
  dateLabel: string;
  /** Field holding the headline amount for the ledger, totals and export. */
  amountKey: string;
  amountLabel: string;
  /** Bank balances are not spend, so they stay out of reviewed totals. */
  countsInTotals: boolean;
  /** Text/filename hints used to detect the type of an upload. */
  keywords: RegExp[];
}

const CURRENCY_FIELD: FieldDef = { key: "currency", label: "Currency", kind: "text" };

export const PRESETS: Record<DocType, DocPreset> = {
  invoice: {
    id: "invoice",
    label: "Invoice",
    plural: "invoices",
    description: "Billed amount owed, with a due date and line items.",
    fields: [
      { key: "vendor", label: "Vendor", kind: "text", wide: true },
      { key: "invoiceNumber", label: "Invoice number", kind: "text", wide: true },
      { key: "issueDate", label: "Issue date", kind: "date" },
      { key: "dueDate", label: "Due date", kind: "date" },
      CURRENCY_FIELD,
      { key: "subtotal", label: "Subtotal", kind: "number" },
      { key: "tax", label: "Tax", kind: "number" },
      { key: "total", label: "Total", kind: "number" },
    ],
    rowColumns: [
      { key: "description", label: "Description", kind: "text" },
      { key: "quantity", label: "Quantity", kind: "number" },
      { key: "unitPrice", label: "Unit price", kind: "number" },
      { key: "amount", label: "Amount", kind: "number" },
    ],
    rowHeading: "Line items",
    addRowLabel: "Add line item",
    emptyRowLabel: "No line items. Add one above.",
    rowTotalLabel: "Line item sum",
    subtitleKey: "vendor",
    referenceKey: "invoiceNumber",
    referenceLabel: "Invoice number",
    dateKey: "issueDate",
    dateLabel: "Issue date",
    amountKey: "total",
    amountLabel: "Total",
    countsInTotals: true,
    keywords: [
      /invoice\b/,
      /invoice[\s_-]*(?:no|number|#)/,
      /bill[\s_-]*to\b/,
      /amount[\s_-]*due/,
      /payment[\s_-]*due/,
      /purchase[\s_-]*order\b/,
      /remit[\s_-]*to\b/,
    ],
  },

  receipt: {
    id: "receipt",
    label: "Receipt",
    plural: "receipts",
    description: "A completed purchase: who was paid, how, and for what.",
    fields: [
      { key: "merchant", label: "Merchant", kind: "text", wide: true },
      { key: "receiptNumber", label: "Receipt number", kind: "text", wide: true },
      { key: "purchaseDate", label: "Purchase date", kind: "date" },
      { key: "paymentMethod", label: "Payment method", kind: "text" },
      CURRENCY_FIELD,
      { key: "tax", label: "Tax", kind: "number" },
      { key: "total", label: "Total paid", kind: "number" },
    ],
    rowColumns: [
      { key: "description", label: "Item", kind: "text" },
      { key: "quantity", label: "Quantity", kind: "number" },
      { key: "amount", label: "Amount", kind: "number" },
    ],
    rowHeading: "Purchases",
    addRowLabel: "Add purchase",
    emptyRowLabel: "No purchases. Add one above.",
    rowTotalLabel: "Purchase sum",
    subtitleKey: "merchant",
    referenceKey: "receiptNumber",
    referenceLabel: "Receipt number",
    dateKey: "purchaseDate",
    dateLabel: "Purchase date",
    amountKey: "total",
    amountLabel: "Total paid",
    countsInTotals: true,
    keywords: [
      /\breceipt\b/,
      /change[\s_-]*due/,
      /\bcashier\b/,
      /payment[\s_-]*method/,
      /thank[\s_-]*you[\s_-]*for[\s_-]*your/,
      /card[\s_-]*ending/,
      /\btendered\b/,
    ],
  },

  bank_statement: {
    id: "bank_statement",
    label: "Bank statement",
    plural: "bank statements",
    description: "Account movements over a statement period, with running balance.",
    fields: [
      { key: "bankName", label: "Bank", kind: "text", wide: true },
      { key: "accountName", label: "Account holder", kind: "text", wide: true },
      { key: "accountNumber", label: "Account number", kind: "text" },
      CURRENCY_FIELD,
      { key: "periodStart", label: "Period start", kind: "date" },
      { key: "periodEnd", label: "Period end", kind: "date" },
      { key: "openingBalance", label: "Opening balance", kind: "number" },
      { key: "closingBalance", label: "Closing balance", kind: "number" },
    ],
    rowColumns: [
      { key: "date", label: "Date", kind: "date" },
      { key: "description", label: "Description", kind: "text" },
      { key: "amount", label: "Amount", kind: "number" },
      { key: "balance", label: "Balance", kind: "number" },
    ],
    rowHeading: "Transactions",
    addRowLabel: "Add transaction",
    emptyRowLabel: "No transactions. Add one above.",
    rowTotalLabel: "Net movement",
    subtitleKey: "bankName",
    referenceKey: "accountNumber",
    referenceLabel: "Account number",
    dateKey: "periodEnd",
    dateLabel: "Statement ends",
    amountKey: "closingBalance",
    amountLabel: "Closing balance",
    countsInTotals: false,
    keywords: [
      /bank[\s_-]*statement/,
      /statement[\s_-]*of[\s_-]*account/,
      /account[\s_-]*statement/,
      /statement[\s_-]*period/,
      /opening[\s_-]*balance/,
      /closing[\s_-]*balance/,
      /beginning[\s_-]*balance/,
      /ending[\s_-]*balance/,
      /account[\s_-]*(?:no|number|#)/,
      /\biban\b/,
      /\bwithdrawals?\b/,
      /\bdeposits?\b/,
      /statement/,
    ],
  },
};

export const DOC_TYPES: DocType[] = ["invoice", "receipt", "bank_statement"];

/** Every field key across presets, in preset order — the export column set. */
export const FIELD_KEYS: string[] = (() => {
  const keys: string[] = [];
  for (const type of DOC_TYPES) for (const field of PRESETS[type].fields) if (!keys.includes(field.key)) keys.push(field.key);
  return keys;
})();

/** Every line-table column across presets, in preset order. */
export const ROW_COLUMN_KEYS: string[] = (() => {
  const keys: string[] = [];
  for (const type of DOC_TYPES) for (const column of PRESETS[type].rowColumns) if (!keys.includes(column.key)) keys.push(column.key);
  return keys;
})();

const FIELD_KINDS: Record<string, FieldKind> = Object.fromEntries(
  DOC_TYPES.flatMap((type) => PRESETS[type].fields.map((field) => [field.key, field.kind] as const))
);

export function isDocType(value: unknown): value is DocType {
  return typeof value === "string" && (DOC_TYPES as string[]).includes(value);
}

export function presetFor(docType: unknown): DocPreset {
  return isDocType(docType) ? PRESETS[docType] : PRESETS.invoice;
}

function matches(re: RegExp, value: string) {
  re.lastIndex = 0;
  return re.test(value);
}

/**
 * Guess the document type from its text and filename. An explicit user choice
 * always wins over this; a filename hint counts double a body match.
 */
export function detectDocType(text: string, fileName = ""): DocType {
  const body = text.toLowerCase();
  const name = fileName.toLowerCase();
  const score = (preset: DocPreset) =>
    preset.keywords.reduce(
      (total, re) => total + (matches(re, body) ? 1 : 0) + (matches(re, name) ? 2 : 0),
      0
    );

  const bank = score(PRESETS.bank_statement);
  const receipt = score(PRESETS.receipt);
  const invoice = score(PRESETS.invoice);

  if (bank >= 2 && bank > receipt && bank > invoice) return "bank_statement";
  if (receipt >= 2 && receipt > invoice) return "receipt";
  return "invoice";
}

const KNOWN_CURRENCIES = [
  "USD", "EUR", "GBP", "JPY", "CAD", "AUD", "CHF", "CNY", "HKD", "SGD", "PHP",
  "NZD", "SEK", "NOK", "DKK", "INR", "BRL", "MXN", "ZAR", "AED", "KRW", "TRY", "PLN",
];

const CURRENCY_SYMBOLS: Record<string, string> = {
  $: "USD", "€": "EUR", "£": "GBP", "¥": "JPY", "₱": "PHP", "₹": "INR", "₩": "KRW",
};

/** Normalize currency to an ISO code, falling back to the document text. */
export function normalizeCurrency(value: unknown, text = ""): string {
  const raw = typeof value === "string" ? value.trim() : "";
  const upper = raw.toUpperCase();
  if (KNOWN_CURRENCIES.includes(upper)) return upper;
  if (upper.length === 3 && /^[A-Z]{3}$/.test(upper)) return upper;
  for (const [symbol, code] of Object.entries(CURRENCY_SYMBOLS)) {
    if (raw.includes(symbol) || text.includes(symbol)) return code;
  }
  const hinted = KNOWN_CURRENCIES.find((code) => new RegExp(`\\b${code}\\b`).test(text.toUpperCase()));
  return hinted ?? "USD";
}

const MAX_FIELD_TEXT = 500;
const MAX_NUMBER = 1_000_000_000;

function coerceScalar(value: unknown, kind: FieldKind): FieldValue {
  if (kind === "number") {
    const n = Number(typeof value === "string" ? value.replace(/[^\d.+-]/g, "") : value);
    return Number.isFinite(n) && Math.abs(n) <= MAX_NUMBER ? n : 0;
  }
  if (typeof value === "number") return String(value).slice(0, MAX_FIELD_TEXT);
  if (typeof value !== "string") return "";
  return value.trim().slice(0, kind === "date" ? 50 : MAX_FIELD_TEXT);
}

/** Keep only the preset's fields, with values coerced to their declared kind. */
export function coerceFields(preset: DocPreset, input: unknown): Record<string, FieldValue> {
  const source = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const fields: Record<string, FieldValue> = {};
  for (const field of preset.fields) {
    fields[field.key] = coerceScalar(source[field.key], field.kind);
  }
  if (preset.fields.some((field) => field.key === "currency")) {
    fields.currency = normalizeCurrency(source.currency, Object.values(source).filter((v) => typeof v === "string").join(" "));
  }
  return fields;
}

/** Keep only the preset's columns, dropping anything the shape does not have. */
export function coerceRows(preset: DocPreset, input: unknown): DocumentRow[] {
  if (!Array.isArray(input)) return [];
  return input.slice(0, 500).flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const source = entry as Record<string, unknown>;
    const row: DocumentRow = {};
    for (const column of preset.rowColumns) row[column.key] = coerceScalar(source[column.key], column.kind);
    const hasContent = preset.rowColumns.some((column) => String(row[column.key] ?? "").trim() !== "" && row[column.key] !== 0);
    return hasContent ? [row] : [];
  });
}

/** Field-only coercion for a partial update, rejecting keys no preset declares. */
export function coerceFieldPatch(input: unknown): Record<string, FieldValue> {
  const source = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const patch: Record<string, FieldValue> = {};
  for (const [key, value] of Object.entries(source)) {
    const kind = FIELD_KINDS[key];
    if (!kind) continue;
    if (kind === "number") {
      const n = Number(value);
      if (!Number.isFinite(n) || Math.abs(n) > MAX_NUMBER) throw new Error(`Invalid ${key}`);
      patch[key] = n;
      continue;
    }
    if (typeof value !== "string") throw new Error(`Invalid ${key}`);
    if (key === "currency") patch[key] = normalizeCurrency(value);
    else patch[key] = value.trim().slice(0, kind === "date" ? 50 : MAX_FIELD_TEXT);
  }
  return patch;
}

function amount(value: FieldValue | undefined): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Headline amount for stats, ledgers and exports. */
export function recordAmount(record: { docType?: unknown; fields?: Record<string, FieldValue> }): number {
  const preset = presetFor(record.docType);
  return amount(record.fields?.[preset.amountKey]);
}

export function recordCurrency(record: { fields?: Record<string, FieldValue> }): string {
  return normalizeCurrency(record.fields?.currency);
}

export function recordField(record: { fields?: Record<string, FieldValue> }, key: string): string {
  const value = record.fields?.[key];
  return value === undefined || value === null ? "" : String(value);
}
