import type { User, DocumentRecord as ExtractedRecord } from "@/lib/types";
export type { User, DocumentRecord as ExtractedRecord } from "@/lib/types";

export const API_BASE = "/api";

export async function fetchJSON(input: string, init?: RequestInit) {
  const res = await fetch(input, { credentials: "same-origin", ...init });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) || res.statusText);
  return data;
}

export async function updateRecord(id: string, patch: Record<string, unknown>) {
  return fetchJSON(`${API_BASE}/records/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  }) as Promise<ExtractedRecord>;
}

export interface SheetsExportOptions {
  spreadsheetId: string;
  recordIds?: string[];
  mapping?: Record<string, string | number>;
}

export interface SheetsExportResult {
  updatedRows: number;
  spreadsheetUrl: string;
}

export async function exportToSheets(
  options: SheetsExportOptions,
): Promise<SheetsExportResult> {
  return fetchJSON(`${API_BASE}/export/sheets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(options),
  }) as Promise<SheetsExportResult>;
}

export async function getGoogleAuthUrl(): Promise<{ url: string }> {
  return fetchJSON(`${API_BASE}/google/connect`);
}

export async function hasGoogleConnection(): Promise<{ connected: boolean }> {
  return fetchJSON(`${API_BASE}/google/me`);
}

export async function disconnectGoogle(): Promise<{ ok: boolean }> {
  return fetchJSON(`${API_BASE}/google/disconnect`, { method: "POST" });
}
