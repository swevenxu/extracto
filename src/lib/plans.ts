/**
 * Plans and usage vocabulary — no server-only imports, so client components can
 * use the plan table and the allowance shapes directly.
 */
import type { PlanId } from "./types";

/** Largest single file the upload route accepts. */
export const MAX_FILE_MB = 8;

export interface Plan {
  id: PlanId;
  name: string;
  /** USD per month; 0 for the free plan. Not charged anywhere yet. */
  priceMonthly: number;
  documentsPerMonth: number;
  summary: string;
  features: string[];
}

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    priceMonthly: 0,
    documentsPerMonth: 25,
    summary: "The full workflow at a small monthly volume.",
    features: ["25 documents a month", "All three document types", "CSV export", "1 reviewer per workspace"],
  },
  team: {
    id: "team",
    name: "Team",
    priceMonthly: 29,
    documentsPerMonth: 500,
    summary: "For a finance team sharing one ledger.",
    features: ["500 documents a month", "Shared workspaces", "Reviewer assignment and history", "Google Sheets export"],
  },
  business: {
    id: "business",
    name: "Business",
    priceMonthly: 99,
    documentsPerMonth: 2500,
    summary: "High-volume processing across several workspaces.",
    features: ["2,500 documents a month", "Everything in Team", "Up to 10 workspaces", "Priority extraction"],
  },
};

export const PLAN_IDS: PlanId[] = ["free", "team", "business"];
export const DEFAULT_PLAN: PlanId = "free";

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === "string" && (PLAN_IDS as string[]).includes(value);
}

export function planFor(value: unknown): Plan {
  return PLANS[isPlanId(value) ? value : DEFAULT_PLAN];
}

export interface DocumentQuota {
  plan: PlanId;
  planName: string;
  limit: number;
  used: number;
  remaining: number;
  /** ISO timestamp the allowance resets at. */
  resetsAt: string;
}

export interface Allowance {
  used: number;
  limit: number;
  remaining: number;
  /** 0–100, clamped. */
  percent: number;
}

export type UsageLevel = "ok" | "warning" | "full";

export interface UsageSnapshot {
  plan: PlanId;
  planName: string;
  priceMonthly: number;
  periodStart: string;
  periodEnd: string;
  resetsAt: string;
  documents: Allowance;
  workspaces: Allowance;
  savedExports: Allowance;
  membersPerWorkspace: number;
  maxFileMb: number;
  /** Severity of the document allowance, for labelling the meter. */
  level: UsageLevel;
}

/** Deterministic date copy so server and client render the same string. */
export function formatResetDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "next month";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}
