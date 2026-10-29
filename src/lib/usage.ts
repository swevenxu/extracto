/**
 * Server-side usage metering.
 *
 * Every accepted document is one unit of processing, counted per account per
 * calendar month (UTC). The counter is written by the upload route before
 * extraction starts, so the UI can show what is left before it runs out rather
 * than after a request has already been rejected.
 *
 * Billing itself is not connected yet: a plan is an entitlement on the account,
 * not a recorded payment. Replace `setPlan` with a checkout webhook when that
 * lands.
 */
import fs from "fs";
import path from "path";
import type { PlanId, User } from "./types";
import {
  MAX_EXPORT_PRESETS,
  MAX_WORKSPACES_PER_USER,
  MAX_WORKSPACE_MEMBERS,
  getPreferences,
  listExportPresets,
  listWorkspacesForUser,
  updatePreferences,
} from "./storage";
import {
  MAX_FILE_MB,
  planFor,
  type Allowance,
  type DocumentQuota,
  type UsageLevel,
  type UsageSnapshot,
} from "./plans";

export { PLANS, PLAN_IDS, isPlanId, planFor, formatResetDate } from "./plans";
export type { Allowance, DocumentQuota, Plan, UsageSnapshot } from "./plans";

const USAGE_FILE = path.join(process.cwd(), "data", "usage.json");

/** Share of the allowance at which the UI starts warning, before the wall. */
const WARN_AT_PERCENT = 80;

export function activePlanId(userId: string): PlanId {
  return planFor(getPreferences(userId)?.plan).id;
}

export function setPlan(userId: string, plan: PlanId): PlanId {
  updatePreferences(userId, { plan });
  return plan;
}

export interface UsagePeriod {
  /** First moment of the current month, ISO. */
  start: string;
  /** First moment of next month, ISO — when the allowance resets. */
  end: string;
}

export function currentPeriod(now = new Date()): UsagePeriod {
  return {
    start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString(),
    end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString(),
  };
}

interface UsageEntry {
  userId: string;
  periodStart: string;
  documents: number;
}

function readEntries(): UsageEntry[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(USAGE_FILE, "utf-8"));
    return Array.isArray(parsed) ? (parsed as UsageEntry[]) : [];
  } catch {
    return [];
  }
}

function writeEntries(entries: UsageEntry[]) {
  const dir = path.dirname(USAGE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(USAGE_FILE, JSON.stringify(entries, null, 2), "utf-8");
}

function documentsThisPeriod(userId: string, periodStart: string): number {
  const entry = readEntries().find(
    (candidate) => candidate.userId === userId && candidate.periodStart === periodStart
  );
  return entry ? Math.max(0, entry.documents) : 0;
}

function allowance(used: number, limit: number): Allowance {
  return {
    used,
    limit,
    remaining: Math.max(0, limit - used),
    percent: limit <= 0 ? 100 : Math.min(100, Math.round((used / limit) * 100)),
  };
}

/** This month's document allowance for one account. */
export function documentQuota(user: User): DocumentQuota {
  const plan = planFor(activePlanId(user.id));
  const period = currentPeriod();
  const used = documentsThisPeriod(user.id, period.start);
  return {
    plan: plan.id,
    planName: plan.name,
    limit: plan.documentsPerMonth,
    used,
    remaining: Math.max(0, plan.documentsPerMonth - used),
    resetsAt: period.end,
  };
}

/**
 * Atomically check the allowance and count one document.
 *
 * Reads, checks and writes in one synchronous pass so two uploads racing for the
 * last slot cannot both be admitted. Older periods are dropped on every write, so
 * the file never grows past a couple of rows per account.
 */
export function consumeDocumentQuota(user: User): { allowed: boolean; quota: DocumentQuota } {
  const plan = planFor(activePlanId(user.id));
  const period = currentPeriod();
  const entries = readEntries().filter((entry) => entry.periodStart >= period.start);
  const index = entries.findIndex(
    (entry) => entry.userId === user.id && entry.periodStart === period.start
  );
  const used = index >= 0 ? Math.max(0, entries[index].documents) : 0;
  const quota = (count: number): DocumentQuota => ({
    plan: plan.id,
    planName: plan.name,
    limit: plan.documentsPerMonth,
    used: count,
    remaining: Math.max(0, plan.documentsPerMonth - count),
    resetsAt: period.end,
  });

  if (used >= plan.documentsPerMonth) {
    return { allowed: false, quota: quota(used) };
  }

  if (index >= 0) entries[index] = { ...entries[index], documents: used + 1 };
  else entries.push({ userId: user.id, periodStart: period.start, documents: 1 });
  writeEntries(entries);
  return { allowed: true, quota: quota(used + 1) };
}

export function getUsage(user: User): UsageSnapshot {
  const plan = planFor(activePlanId(user.id));
  const period = currentPeriod();
  const documents = allowance(documentsThisPeriod(user.id, period.start), plan.documentsPerMonth);
  const level: UsageLevel =
    documents.remaining === 0 ? "full" : documents.percent >= WARN_AT_PERCENT ? "warning" : "ok";
  return {
    plan: plan.id,
    planName: plan.name,
    priceMonthly: plan.priceMonthly,
    periodStart: period.start,
    periodEnd: period.end,
    resetsAt: period.end,
    documents,
    workspaces: allowance(listWorkspacesForUser(user).length, MAX_WORKSPACES_PER_USER),
    savedExports: allowance(listExportPresets(user.id).length, MAX_EXPORT_PRESETS),
    membersPerWorkspace: MAX_WORKSPACE_MEMBERS,
    maxFileMb: MAX_FILE_MB,
    level,
  };
}
