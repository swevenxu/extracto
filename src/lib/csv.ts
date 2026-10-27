import type { ExtractedRecord } from "./types";

function escape(value: string | number | undefined | null): string {
  if (value === undefined || value === null) return "";
  const raw = String(value);
  const s = typeof value === "string" && /^[\t\r ]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
  if (!/[",\n\r]/.test(s)) return s;
  return '"' + s.replace(/"/g, '""') + '"';
}

function docFields(r: ExtractedRecord): (string | number)[] {
  return [
    r.id, r.fileName, r.uploadedAt, r.vendor ?? "", r.invoiceNumber ?? "",
    r.issueDate ?? "", r.dueDate ?? "", r.currency, r.subtotal, r.tax, r.total, r.status,
  ];
}

export const CSV_HEADER = [
    "id",
    "fileName",
    "uploadedAt",
    "vendor",
    "invoiceNumber",
    "issueDate",
    "dueDate",
    "currency",
    "subtotal",
    "tax",
    "total",
    "status",
    "lineNumber",
    "description",
    "quantity",
    "unitPrice",
    "amount",
];

export function recordRows(record: ExtractedRecord): (string | number)[][] {
  const base = docFields(record);
  if (!record.lineItems?.length) return [[...base, 0, "", "", "", ""]];
  return record.lineItems.map((li, i) => [...base, i + 1, li.description, li.quantity, li.unitPrice, li.amount]);
}

export function recordToCsv(record: ExtractedRecord): string {
  return [CSV_HEADER.join(","), ...recordRows(record).map((row) => row.map(escape).join(","))].join("\r\n");
}

export function recordsToCsv(records: ExtractedRecord[]): string {
  return [CSV_HEADER.join(","), ...records.flatMap(recordRows).map((row) => row.map(escape).join(","))].join("\r\n");
}
