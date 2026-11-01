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
import { randomUUID } from "crypto";
import type { PlanId, User } from "./types";
import { getSupabaseAdmin } from "./supabase";
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

/** Share of the allowance at which the UI starts warning, before the wall. */
const WARN_AT_PERCENT = 80;

export async function activePlanId(userId: string): Promise<PlanId> {
  return planFor((await getPreferences(userId))?.plan).id;
}

export async function setPlan(userId: string, plan: PlanId): Promise<PlanId> {
  await updatePreferences(userId, { plan });
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

async function documentsThisPeriod(userId: string, periodStart: string): Promise<number> {
  const { count, error } = await getSupabaseAdmin()
    .from("usage_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", periodStart);
  if (error) throw error;
  return count ?? 0;
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
export async function documentQuota(user: User): Promise<DocumentQuota> {
  const plan = planFor(await activePlanId(user.id));
  const period = currentPeriod();
  const used = await documentsThisPeriod(user.id, period.start);
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
export async function consumeDocumentQuota(user: User): Promise<{ allowed: boolean; quota: DocumentQuota }> {
  const plan = planFor(await activePlanId(user.id));
  const period = currentPeriod();
  const { data: nextCount, error } = await getSupabaseAdmin().rpc("consume_document_quota", {
    p_user_id: user.id,
    p_period_start: period.start,
    p_limit: plan.documentsPerMonth,
    p_event_id: randomUUID(),
  });
  if (error) throw error;
  const used = Number(nextCount);
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
  return { allowed: true, quota: quota(used) };
}

export async function getUsage(user: User): Promise<UsageSnapshot> {
  const plan = planFor(await activePlanId(user.id));
  const period = currentPeriod();
  const documents = allowance(await documentsThisPeriod(user.id, period.start), plan.documentsPerMonth);
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
    workspaces: allowance((await listWorkspacesForUser(user)).length, MAX_WORKSPACES_PER_USER),
    savedExports: allowance((await listExportPresets(user.id)).length, MAX_EXPORT_PRESETS),
    membersPerWorkspace: MAX_WORKSPACE_MEMBERS,
    maxFileMb: MAX_FILE_MB,
    level,
  };
}
