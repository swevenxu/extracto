import fs from "fs";
import path from "path";
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "crypto";
import type { Currency, ExtractedRecord, User, UserPreferences } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const RECORDS_FILE = path.join(DATA_DIR, "records.json");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const PREFERENCES_FILE = path.join(DATA_DIR, "preferences.json");

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readAll(): ExtractedRecord[] {
  ensureDir();
  if (!fs.existsSync(RECORDS_FILE)) return [];
  try {
    const raw = fs.readFileSync(RECORDS_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
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

export function listRecordsByUser(userId: string): ExtractedRecord[] {
  return readAll()
    .filter((r) => r.userId === userId)
    .sort((a, b) => (a.uploadedAt < b.uploadedAt ? 1 : -1));
}

export function getRecord(id: string, userId?: string): ExtractedRecord | undefined {
  const rec = readAll().find((r) => r.id === id);
  if (!rec) return undefined;
  if (userId && rec.userId !== userId) return undefined;
  return rec;
}

export function updateRecord(
  id: string,
  patch: Partial<ExtractedRecord>,
  userId?: string
): ExtractedRecord | undefined {
  const records = readAll();
  const idx = records.findIndex((r) => r.id === id);
  if (idx < 0) return undefined;
  if (userId && records[idx].userId !== userId) return undefined;
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

export function deleteRecord(id: string, userId?: string): boolean {
  const records = readAll();
  const idx = records.findIndex(
    (r) => r.id === id && (!userId || r.userId === userId)
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
