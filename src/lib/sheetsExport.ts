import { CSV_HEADER } from "./csv";
import type { ExportMode } from "./types";

/** Columns an export can place, in their default order. */
export const EXPORT_FIELDS = CSV_HEADER;

export function columnLetter(index: number): string {
  let name = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  }
  return name;
}

export function columnIndex(letter: string): number {
  let index = 0;
  for (const char of letter.toUpperCase()) index = index * 26 + (char.charCodeAt(0) - 64);
  return index - 1;
}

/** A, B, C… in CSV_HEADER order. */
export function defaultMapping(): Record<string, string> {
  return Object.fromEntries(EXPORT_FIELDS.map((field, index) => [field, columnLetter(index)]));
}

/**
 * Validate a field → column mapping. Accepts letters (`"C"`) or zero-based
 * indices; returns letters, keeps CSV_HEADER ordering, and rejects collisions.
 */
export function normalizeMapping(input: unknown): Record<string, string> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("A column mapping is required");
  }
  const mapping: Record<string, string> = {};
  const used = new Set<number>();

  for (const field of EXPORT_FIELDS) {
    const raw = (input as Record<string, unknown>)[field];
    if (raw === undefined || raw === null || (typeof raw === "string" && raw.trim() === "")) continue;

    let index: number;
    if (typeof raw === "number") index = raw;
    else if (typeof raw === "string" && /^[A-Za-z]{1,3}$/.test(raw.trim())) index = columnIndex(raw.trim());
    else if (typeof raw === "string" && /^\d{1,4}$/.test(raw.trim())) index = Number(raw.trim());
    else throw new Error(`Column for ${field} must be a letter such as C or a number`);

    if (!Number.isInteger(index) || index < 0 || index > 999) {
      throw new Error(`Column for ${field} is out of range`);
    }
    if (used.has(index)) throw new Error(`Column ${columnLetter(index)} is used twice`);
    used.add(index);
    mapping[field] = columnLetter(index);
  }

  if (Object.keys(mapping).length === 0) throw new Error("Map at least one column");
  return mapping;
}

/**
 * Place each exported row's values into the mapped columns. Rows are aligned to
 * CSV_HEADER, so the mapping decides position and the header labels the result.
 */
export function buildSheetRows(
  rows: (string | number)[][],
  mapping: Record<string, string>
): { header: string[]; data: (string | number)[][]; columnCount: number } {
  const placed = Object.entries(mapping)
    .map(([field, letter]) => ({ source: EXPORT_FIELDS.indexOf(field), target: columnIndex(letter) }))
    .filter((entry) => entry.source >= 0);

  const columnCount = Math.max(0, ...placed.map((entry) => entry.target)) + 1;
  const header: string[] = Array(columnCount).fill("");
  for (const entry of placed) header[entry.target] = EXPORT_FIELDS[entry.source];

  const data = rows.map((row) => {
    const out: (string | number)[] = Array(columnCount).fill("");
    for (const entry of placed) out[entry.target] = row[entry.source] ?? "";
    return out;
  });

  return { header, data, columnCount };
}

/**
 * Where an appending export starts. An empty tab gets the header on row 1;
 * otherwise rows continue under the existing data and the header is left alone.
 */
export function appendStartRow(existingRowCount: number): { startRow: number; includeHeader: boolean } {
  if (existingRowCount <= 0) return { startRow: 1, includeHeader: true };
  return { startRow: existingRowCount + 1, includeHeader: false };
}

export function isExportMode(value: unknown): value is ExportMode {
  return value === "append" || value === "new_sheet";
}

/** Sheet titles cannot contain []:*?/\ and are limited to 100 characters. */
export function sanitizeSheetTitle(raw: string): string {
  return raw
    .replace(/[[\]:*?/\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}

/** Default tab name for a new-sheet export, e.g. "Extracto 2026-10-28 11-42-07". */
export function suggestedSheetTitle(date = new Date()): string {
  const iso = new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString();
  return `Extracto ${iso.slice(0, 10)} ${iso.slice(11, 19).replace(/:/g, "-")}`;
}

/** Accept either a raw spreadsheet ID or a pasted spreadsheet URL. */
export function extractSpreadsheetId(raw: string): string {
  const value = raw.trim();
  const fromUrl = value.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]+)/);
  if (fromUrl) return fromUrl[1];
  return value;
}
