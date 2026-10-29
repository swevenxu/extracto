import { DOC_TYPES, PRESETS, presetFor } from "./docTypes";
import { appendActivity } from "./storage";
import type { ActivityChange, ActivityEvent, ActivityType, DocumentRecord, User } from "./types";

const EXTRA_LABELS: Record<string, string> = {
  docType: "Document type",
  status: "Status",
  rows: "Rows",
  assigneeId: "Assignee",
};

/** Human label for a field key, across every preset. */
export function fieldLabel(key: string): string {
  for (const type of DOC_TYPES) {
    const field = PRESETS[type].fields.find((candidate) => candidate.key === key);
    if (field) return field.label;
  }
  return EXTRA_LABELS[key] ?? key;
}

function display(value: unknown): string {
  if (value === undefined || value === null || value === "") return "—";
  return String(value);
}

/**
 * Differences between a stored record and the patch about to be applied.
 * Row edits are summarised, field edits are listed value by value.
 */
export function diffRecord(before: DocumentRecord, patch: Partial<DocumentRecord>): ActivityChange[] {
  const changes: ActivityChange[] = [];
  const push = (field: string, from: unknown, to: unknown) => {
    if (display(from) !== display(to)) changes.push({ field, from: display(from), to: display(to) });
  };

  if (patch.docType && patch.docType !== before.docType) {
    push("Document type", presetFor(before.docType).label, presetFor(patch.docType).label);
  }

  if (patch.fields) {
    const keys = new Set([...Object.keys(before.fields ?? {}), ...Object.keys(patch.fields)]);
    for (const key of keys) push(fieldLabel(key), before.fields?.[key], patch.fields[key]);
  }

  if (patch.rows && JSON.stringify(patch.rows) !== JSON.stringify(before.rows ?? [])) {
    push("Rows", `${before.rows?.length ?? 0} rows`, `${patch.rows.length} rows`);
  }

  if (patch.status && patch.status !== before.status) {
    push("Status", before.status, patch.status);
  }

  return changes.slice(0, 20);
}

/** One-line description of a change set, e.g. "Total 1,296 → 1,200". */
export function describeChanges(changes: ActivityChange[]): string {
  if (changes.length === 0) return "";
  const shown = changes.slice(0, 3).map((change) => `${change.field} ${change.from} → ${change.to}`);
  const rest = changes.length - shown.length;
  return rest > 0 ? `${shown.join("; ")} (+${rest} more)` : shown.join("; ");
}

export function recordActivity(input: {
  workspaceId: string;
  record: { id: string; fileName: string };
  actor: User;
  type: ActivityType;
  summary: string;
  changes?: ActivityChange[];
}): ActivityEvent {
  return appendActivity({
    workspaceId: input.workspaceId,
    recordId: input.record.id,
    recordName: input.record.fileName,
    actorId: input.actor.id,
    actorName: input.actor.name,
    type: input.type,
    summary: input.summary,
    changes: input.changes?.length ? input.changes : undefined,
  });
}
