import fs from "fs";
import path from "path";
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "crypto";
import type {
  ActivityEvent,
  Currency,
  ExportMode,
  ExportPreset,
  ExtractedRecord,
  User,
  UserPreferences,
  Workspace,
  WorkspaceMemberView,
  WorkspaceRole,
} from "./types";
import { isDocType, presetFor } from "./docTypes";

const DATA_DIR = path.join(process.cwd(), "data");
const RECORDS_FILE = path.join(DATA_DIR, "records.json");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const PREFERENCES_FILE = path.join(DATA_DIR, "preferences.json");
const EXPORTS_FILE = path.join(DATA_DIR, "exports.json");
const WORKSPACES_FILE = path.join(DATA_DIR, "workspaces.json");
const ACTIVITY_FILE = path.join(DATA_DIR, "activity.json");

/** Saved export configurations allowed per user. */
export const MAX_EXPORT_PRESETS = 20;
/** History entries kept across all workspaces (oldest are dropped). */
export const MAX_ACTIVITY_EVENTS = 5000;
/** Workspaces a user may create. */
export const MAX_WORKSPACES_PER_USER = 10;

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

const text = (value: unknown, max = 500) => (typeof value === "string" ? value.slice(0, max) : "");

/** Deterministic id for a user's private workspace, so legacy records map without a lookup. */
export function personalWorkspaceId(userId: string): string {
  return `ws-personal-${userId}`;
}
const number = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Records written before document presets existed are invoice-shaped: lift their
 * top-level fields and line items into the generic `fields`/`rows` model.
 */
function normalizeRecord(raw: unknown): ExtractedRecord {
  const value = raw as Record<string, unknown>;
  // Records made before workspaces existed belong to their uploader's private workspace.
  const ownerId = text(value.userId);
  const meta = {
    workspaceId: text(value.workspaceId) || (ownerId ? personalWorkspaceId(ownerId) : "ws-unowned"),
    assigneeId: typeof value.assigneeId === "string" && value.assigneeId ? value.assigneeId : undefined,
    updatedBy: typeof value.updatedBy === "string" && value.updatedBy ? value.updatedBy : undefined,
    updatedAt: typeof value.updatedAt === "string" && value.updatedAt ? value.updatedAt : undefined,
  };
  if (isDocType(value.docType) && value.fields && typeof value.fields === "object") {
    return { ...value, ...meta, rows: Array.isArray(value.rows) ? value.rows : [] } as unknown as ExtractedRecord;
  }

  const preset = presetFor("invoice");
  const fields: Record<string, string | number> = Object.fromEntries(
    preset.fields.map((field) => [field.key, field.kind === "number" ? number(value[field.key]) : text(value[field.key])])
  );
  if (!fields.currency) fields.currency = "USD";
  const rows = (Array.isArray(value.lineItems) ? value.lineItems : []).map((item) => {
    const line = item as Record<string, unknown>;
    return {
      description: text(line.description, 500),
      quantity: number(line.quantity),
      unitPrice: number(line.unitPrice),
      amount: number(line.amount),
    };
  });

  return {
    ...meta,
    id: text(value.id),
    userId: text(value.userId),
    fileName: text(value.fileName),
    fileUrl: typeof value.fileUrl === "string" ? value.fileUrl : undefined,
    fileSize: number(value.fileSize),
    uploadedAt: text(value.uploadedAt),
    docType: "invoice",
    fields,
    rows,
    status: (value.status as ExtractedRecord["status"]) ?? "extracted",
    rawText: typeof value.rawText === "string" ? value.rawText : undefined,
    extractionError: typeof value.extractionError === "string" ? value.extractionError : undefined,
    demoMode: typeof value.demoMode === "boolean" ? value.demoMode : undefined,
  };
}

function readAll(): ExtractedRecord[] {
  ensureDir();
  if (!fs.existsSync(RECORDS_FILE)) return [];
  try {
    const raw = fs.readFileSync(RECORDS_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(normalizeRecord) : [];
  } catch {
    return [];
  }
}

function writeAll(records: ExtractedRecord[]) {
  ensureDir();
  fs.writeFileSync(RECORDS_FILE, JSON.stringify(records, null, 2), "utf-8");
}

export function listRecords(): ExtractedRecord[] {
  return readAll().sort((a, b) => (a.uploadedAt < b.uploadedAt ? 1 : -1));
}

export function listRecordsByWorkspace(workspaceId: string): ExtractedRecord[] {
  return readAll()
    .filter((r) => r.workspaceId === workspaceId)
    .sort((a, b) => (a.uploadedAt < b.uploadedAt ? 1 : -1));
}

export function getRecord(id: string, workspaceId?: string): ExtractedRecord | undefined {
  const rec = readAll().find((r) => r.id === id);
  if (!rec) return undefined;
  if (workspaceId && rec.workspaceId !== workspaceId) return undefined;
  return rec;
}

export function updateRecord(
  id: string,
  patch: Partial<ExtractedRecord>,
  workspaceId?: string
): ExtractedRecord | undefined {
  const records = readAll();
  const idx = records.findIndex((r) => r.id === id);
  if (idx < 0) return undefined;
  if (workspaceId && records[idx].workspaceId !== workspaceId) return undefined;
  records[idx] = { ...records[idx], ...patch, id };
  writeAll(records);
  return records[idx];
}

export function upsertRecord(record: ExtractedRecord): ExtractedRecord {
  const records = readAll();
  const idx = records.findIndex((r) => r.id === record.id);
  if (idx >= 0) records[idx] = record;
  else records.push(record);
  writeAll(records);
  return record;
}

export function deleteRecord(id: string, workspaceId?: string): boolean {
  const records = readAll();
  const idx = records.findIndex(
    (r) => r.id === id && (!workspaceId || r.workspaceId === workspaceId)
  );
  if (idx < 0) return false;
  const next = records.filter((_, i) => i !== idx);
  writeAll(next);
  return true;
}

export function readUsers(): User[] {
  ensureDir();
  if (!fs.existsSync(USERS_FILE)) return [];
  try {
    const raw = fs.readFileSync(USERS_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeUsers(users: User[]) {
  ensureDir();
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), "utf-8");
}

export function findUserByEmail(email: string): User | undefined {
  return readUsers().find((u) => u.email.toLowerCase() === email.toLowerCase());
}

export function authenticateUser(email: string, password: string): User | undefined {
  const user = readUsers().find((u) => u.email.toLowerCase() === email.toLowerCase()) as (User & { passwordHash?: string }) | undefined;
  if (!user?.passwordHash) return undefined;
  const [salt, hash] = user.passwordHash.split(":");
  if (!salt || !hash) return undefined;
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return undefined;
  return { id: user.id, email: user.email, name: user.name };
}

export function createUser(email: string, name: string, password: string): User {
  const users = readUsers();
  if (users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
    throw new Error("User already exists");
  }
  const user: User = { id: crypto.randomUUID(), email: email.toLowerCase(), name };
  const salt = randomBytes(16).toString("hex");
  const passwordHash = `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
  writeUsers([...users, { ...user, passwordHash } as User]);
  return user;
}

export { readAll as readAllRecords };

function readPreferences(): UserPreferences[] {
  ensureDir();
  if (!fs.existsSync(PREFERENCES_FILE)) return [];
  try {
    const raw = fs.readFileSync(PREFERENCES_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writePreferences(preferences: UserPreferences[]) {
  ensureDir();
  fs.writeFileSync(PREFERENCES_FILE, JSON.stringify(preferences, null, 2), "utf-8");
}

export function getPreferences(userId: string): UserPreferences | undefined {
  return readPreferences().find((p) => p.userId === userId);
}

export function getOrCreatePreferences(userId: string): UserPreferences {
  const existing = getPreferences(userId);
  if (existing) return existing;

  const newPrefs: UserPreferences = {
    id: randomUUID(),
    userId,
    baseCurrency: "USD" as Currency,
    locale: "en-US",
    plan: "free",
  };
  const all = readPreferences();
  writePreferences([...all, newPrefs]);
  return newPrefs;
}

export function updatePreferences(userId: string, patch: Partial<UserPreferences>): UserPreferences {
  const all = readPreferences();
  const idx = all.findIndex((p) => p.userId === userId);
  if (idx >= 0) {
    all[idx] = { ...all[idx], ...patch };
    writePreferences(all);
    return all[idx];
  }

  // Create new preferences if none exist
  const newPrefs = getOrCreatePreferences(userId);
  return updatePreferences(userId, patch);
}

function readExportPresets(): ExportPreset[] {
  ensureDir();
  if (!fs.existsSync(EXPORTS_FILE)) return [];
  try {
    const raw = fs.readFileSync(EXPORTS_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeExportPresets(presets: ExportPreset[]) {
  ensureDir();
  fs.writeFileSync(EXPORTS_FILE, JSON.stringify(presets, null, 2), "utf-8");
}

export function listExportPresets(userId: string): ExportPreset[] {
  return readExportPresets()
    .filter((preset) => preset.userId === userId)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function getExportPreset(id: string, userId: string): ExportPreset | undefined {
  return readExportPresets().find((preset) => preset.id === id && preset.userId === userId);
}

export function saveExportPreset(input: {
  id?: string;
  userId: string;
  name: string;
  spreadsheetId: string;
  mapping: Record<string, string>;
  mode: ExportMode;
  sheetName?: string;
}): ExportPreset {
  const presets = readExportPresets();
  const now = new Date().toISOString();

  if (input.id) {
    const index = presets.findIndex((preset) => preset.id === input.id && preset.userId === input.userId);
    if (index < 0) throw new Error("Saved export not found");
    presets[index] = {
      ...presets[index],
      name: input.name,
      spreadsheetId: input.spreadsheetId,
      mapping: input.mapping,
      mode: input.mode,
      sheetName: input.sheetName,
      updatedAt: now,
    };
    writeExportPresets(presets);
    return presets[index];
  }

  if (presets.filter((preset) => preset.userId === input.userId).length >= MAX_EXPORT_PRESETS) {
    throw new Error(`You can save up to ${MAX_EXPORT_PRESETS} exports`);
  }

  const preset: ExportPreset = {
    id: randomUUID(),
    userId: input.userId,
    name: input.name,
    spreadsheetId: input.spreadsheetId,
    mapping: input.mapping,
    mode: input.mode,
    sheetName: input.sheetName,
    createdAt: now,
    updatedAt: now,
  };
  writeExportPresets([...presets, preset]);
  return preset;
}

export function deleteExportPreset(id: string, userId: string): boolean {
  const presets = readExportPresets();
  const remaining = presets.filter((preset) => !(preset.id === id && preset.userId === userId));
  if (remaining.length === presets.length) return false;
  writeExportPresets(remaining);
  return true;
}

/* ------------------------------------------------------------------ *
 * Workspaces: shared containers for documents, with members and roles.
 * ------------------------------------------------------------------ */

export const MAX_WORKSPACE_MEMBERS = 20;

function readWorkspaces(): Workspace[] {
  ensureDir();
  if (!fs.existsSync(WORKSPACES_FILE)) return [];
  try {
    const raw = fs.readFileSync(WORKSPACES_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeWorkspaces(workspaces: Workspace[]) {
  ensureDir();
  fs.writeFileSync(WORKSPACES_FILE, JSON.stringify(workspaces, null, 2), "utf-8");
}

export function ensurePersonalWorkspace(user: User): Workspace {
  const id = personalWorkspaceId(user.id);
  const workspaces = readWorkspaces();
  const existing = workspaces.find((workspace) => workspace.id === id);
  if (existing) return existing;

  const now = new Date().toISOString();
  const workspace: Workspace = {
    id,
    name: "Personal workspace",
    createdBy: user.id,
    createdAt: now,
    members: [{ userId: user.id, role: "owner", joinedAt: now }],
  };
  writeWorkspaces([...workspaces, workspace]);
  return workspace;
}

export function listWorkspacesForUser(user: User): Workspace[] {
  const personalId = personalWorkspaceId(user.id);
  ensurePersonalWorkspace(user);
  return readWorkspaces()
    .filter((workspace) => workspace.members.some((member) => member.userId === user.id))
    .sort((a, b) => {
      if (a.id === personalId) return -1;
      if (b.id === personalId) return 1;
      return a.name.localeCompare(b.name);
    });
}

export function getWorkspace(id: string): Workspace | undefined {
  return readWorkspaces().find((workspace) => workspace.id === id);
}

export function getWorkspaceForUser(id: string, userId: string): Workspace | undefined {
  const workspace = getWorkspace(id);
  if (!workspace) return undefined;
  return workspace.members.some((member) => member.userId === userId) ? workspace : undefined;
}

export function workspaceRole(workspace: Workspace, userId: string): WorkspaceRole | undefined {
  return workspace.members.find((member) => member.userId === userId)?.role;
}

export function createWorkspace(name: string, owner: User): Workspace {
  const workspaces = readWorkspaces();
  const owned = workspaces.filter((workspace) =>
    workspace.members.some((member) => member.userId === owner.id && member.role === "owner")
  ).length;
  if (owned >= MAX_WORKSPACES_PER_USER) {
    throw new Error(`You can own up to ${MAX_WORKSPACES_PER_USER} workspaces`);
  }

  const now = new Date().toISOString();
  const workspace: Workspace = {
    id: randomUUID(),
    name,
    createdBy: owner.id,
    createdAt: now,
    members: [{ userId: owner.id, role: "owner", joinedAt: now }],
  };
  writeWorkspaces([...workspaces, workspace]);
  return workspace;
}

export function addWorkspaceMember(workspaceId: string, actorUserId: string, email: string): Workspace {
  const workspaces = readWorkspaces();
  const index = workspaces.findIndex((workspace) => workspace.id === workspaceId);
  if (index < 0) throw new Error("Workspace not found");
  if (workspaceRole(workspaces[index], actorUserId) !== "owner") {
    throw new Error("Only a workspace owner can manage members");
  }
  if (workspaces[index].members.length >= MAX_WORKSPACE_MEMBERS) {
    throw new Error(`A workspace can have up to ${MAX_WORKSPACE_MEMBERS} members`);
  }

  const user = findUserByEmail(email);
  if (!user) throw new Error("No account uses that email yet — ask them to sign up first");
  if (workspaces[index].members.some((member) => member.userId === user.id)) {
    throw new Error(`${user.name} is already a member`);
  }

  workspaces[index] = {
    ...workspaces[index],
    members: [...workspaces[index].members, { userId: user.id, role: "reviewer", joinedAt: new Date().toISOString() }],
  };
  writeWorkspaces(workspaces);
  return workspaces[index];
}

export function removeWorkspaceMember(workspaceId: string, actorUserId: string, memberUserId: string): Workspace {
  const workspaces = readWorkspaces();
  const index = workspaces.findIndex((workspace) => workspace.id === workspaceId);
  if (index < 0) throw new Error("Workspace not found");
  if (workspaceRole(workspaces[index], actorUserId) !== "owner") {
    throw new Error("Only a workspace owner can manage members");
  }
  const target = workspaces[index].members.find((member) => member.userId === memberUserId);
  if (!target) throw new Error("They are not a member of this workspace");
  if (target.role === "owner") throw new Error("Workspace owners cannot be removed");

  workspaces[index] = {
    ...workspaces[index],
    members: workspaces[index].members.filter((member) => member.userId !== memberUserId),
    // Their assignments fall back to "unassigned" rather than pointing at a non-member.
  };
  writeWorkspaces(workspaces);

  const records = readAll();
  let changed = false;
  for (const record of records) {
    if (record.workspaceId === workspaceId && record.assigneeId === memberUserId) {
      record.assigneeId = undefined;
      changed = true;
    }
  }
  if (changed) writeAll(records);

  return workspaces[index];
}

export function workspaceMembers(workspaceId: string): WorkspaceMemberView[] {
  const workspace = getWorkspace(workspaceId);
  if (!workspace) return [];
  const users = readUsers();
  return workspace.members
    .map((member) => {
      const user = users.find((candidate) => candidate.id === member.userId);
      return { ...member, name: user?.name ?? "Former member", email: user?.email ?? "" };
    })
    .sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === "owner" ? -1 : 1));
}

/** Active workspace from preferences, falling back to the user's personal one. */
export function getActiveWorkspace(user: User): Workspace {
  const personal = ensurePersonalWorkspace(user);
  const prefs = getOrCreatePreferences(user.id);
  const active = prefs.activeWorkspaceId ? getWorkspaceForUser(prefs.activeWorkspaceId, user.id) : undefined;
  if (active) return active;
  if (prefs.activeWorkspaceId !== personal.id) {
    updatePreferences(user.id, { activeWorkspaceId: personal.id });
  }
  return personal;
}

export function setActiveWorkspace(userId: string, workspaceId: string): boolean {
  if (!getWorkspaceForUser(workspaceId, userId)) return false;
  updatePreferences(userId, { activeWorkspaceId: workspaceId });
  return true;
}

/* ------------------------------------------------------- *
 * Activity: an append-only history of document changes.
 * ------------------------------------------------------- */

function readActivity(): ActivityEvent[] {
  ensureDir();
  if (!fs.existsSync(ACTIVITY_FILE)) return [];
  try {
    const raw = fs.readFileSync(ACTIVITY_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeActivity(events: ActivityEvent[]) {
  ensureDir();
  fs.writeFileSync(ACTIVITY_FILE, JSON.stringify(events, null, 2), "utf-8");
}

export function appendActivity(event: Omit<ActivityEvent, "id" | "at">): ActivityEvent {
  const entry: ActivityEvent = { ...event, id: randomUUID(), at: new Date().toISOString() };
  writeActivity([...readActivity(), entry].slice(-MAX_ACTIVITY_EVENTS));
  return entry;
}

export function listActivity(workspaceId: string, recordId?: string, limit = 50): ActivityEvent[] {
  return readActivity()
    .filter((event) => event.workspaceId === workspaceId && (!recordId || event.recordId === recordId))
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .slice(0, limit);
}
