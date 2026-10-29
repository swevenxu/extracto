import type { DocType, DocumentRow, FieldValue } from "./docTypes";

export type Currency =
  | "USD"
  | "EUR"
  | "GBP"
  | "JPY"
  | "CAD"
  | "AUD"
  | "CHF"
  | "CNY"
  | "HKD"
  | "SGD"
  | "PHP"
  | string;

export type RecordStatus = "processing" | "extracted" | "reviewed" | "failed";

/** Billing plan on an account; each plan carries its own monthly allowance. */
export type PlanId = "free" | "team" | "business";

export interface User {
  id: string;
  email: string;
  name: string;
}

/**
 * A stored document. The shape of `fields` and `rows` comes from the preset for
 * `docType` (see lib/docTypes), so one record model covers every document type.
 */
export interface DocumentRecord {
  id: string;
  /** Uploader. */
  userId: string;
  /** Workspace the document lives in; every read and write is scoped to it. */
  workspaceId: string;
  /** Workspace member responsible for reviewing the document. */
  assigneeId?: string;
  /** Last member who saved changes, and when. */
  updatedBy?: string;
  updatedAt?: string;
  fileName: string;
  fileUrl?: string;
  fileSize: number;
  uploadedAt: string;

  docType: DocType;
  fields: Record<string, FieldValue>;
  rows: DocumentRow[];

  status: RecordStatus;

  rawText?: string;
  extractionError?: string;
  demoMode?: boolean;
}

export type ExtractedRecord = DocumentRecord;

export interface UserPreferences {
  id: string;
  userId: string;
  baseCurrency: Currency;
  locale: string;
  /** Workspace the app is currently scoped to. */
  activeWorkspaceId?: string;
  /** Absent on accounts created before plans existed; treated as "free". */
  plan?: PlanId;
}

export type WorkspaceRole = "owner" | "reviewer";

export interface WorkspaceMember {
  userId: string;
  role: WorkspaceRole;
  joinedAt: string;
}

export interface Workspace {
  id: string;
  name: string;
  createdBy: string;
  createdAt: string;
  members: WorkspaceMember[];
}

/** Membership with display details resolved from the user directory. */
export interface WorkspaceMemberView extends WorkspaceMember {
  name: string;
  email: string;
}

export type ActivityType =
  | "uploaded"
  | "extracted"
  | "extraction_failed"
  | "assigned"
  | "updated"
  | "reviewed"
  | "retried"
  | "deleted";

export interface ActivityChange {
  field: string;
  from: string;
  to: string;
}

/** One entry in a document's history: who did what, and which values changed. */
export interface ActivityEvent {
  id: string;
  workspaceId: string;
  recordId: string;
  recordName: string;
  actorId: string;
  /** Denormalized so history stays readable after a member leaves. */
  actorName: string;
  type: ActivityType;
  summary: string;
  changes?: ActivityChange[];
  at: string;
}

export type ExportMode = "append" | "new_sheet";

/** A reusable spreadsheet export: destination, column mapping and write mode. */
export interface ExportPreset {
  id: string;
  userId: string;
  name: string;
  spreadsheetId: string;
  /** Export field (see CSV_HEADER) → column letter. */
  mapping: Record<string, string>;
  mode: ExportMode;
  /** Tab name for `new_sheet` exports; generated when empty. */
  sheetName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Stats {
  totalRecords: number;
  reviewed: number;
  extracted: number;
  processing: number;
  failed: number;
  totalsByCurrency: Record<string, number>;
  grandTotal?: { amount: number; currency: string };
}

export interface DocumentFilter {
  userId?: string;
  status?: RecordStatus;
  query?: string;
  currency?: Currency;
}
