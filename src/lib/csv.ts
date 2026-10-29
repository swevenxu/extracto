import type { ExtractedRecord } from "./types";
import { FIELD_KEYS, ROW_COLUMN_KEYS } from "./docTypes";

function escape(value: string | number | undefined | null): string {
  if (value === undefined || value === null) return "";
  const raw = String(value);
  const s = typeof value === "string" && /^[\t\r ]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
  if (!/["\n\r,]/.test(s)) return s;
  return '"' + s.replace(/"/g, '""') + '"';
}

/**
 * One column set covers every document type: the shared columns first, then the
 * union of preset fields and row columns, so mixed exports keep a stable header.
 */
export const CSV_HEADER = [
  "id",
  "fileName",
  "uploadedAt",
  "docType",
  "status",
  ...FIELD_KEYS,
  "rowNumber",
  ...ROW_COLUMN_KEYS,
];

function docFields(r: ExtractedRecord): (string | number)[] {
  return [
    r.id,
    r.fileName,
    r.uploadedAt,
    r.docType,
    r.status,
    ...FIELD_KEYS.map((key) => r.fields?.[key] ?? ""),
  ];
}

export function recordRows(record: ExtractedRecord): (string | number)[][] {
  const base = docFields(record);
  const rows = record.rows?.length ? record.rows : [null];
  return rows.map((row, index) => [
    ...base,
    record.rows?.length ? index + 1 : 0,
    ...ROW_COLUMN_KEYS.map((key) => row?.[key] ?? ""),
  ]);
}

export function recordToCsv(record: ExtractedRecord): string {
  return [CSV_HEADER.join(","), ...recordRows(record).map((row) => row.map(escape).join(","))].join("\r\n");
}

export function recordsToCsv(records: ExtractedRecord[]): string {
  return [CSV_HEADER.join(","), ...records.flatMap(recordRows).map((row) => row.map(escape).join(","))].join("\r\n");
}
