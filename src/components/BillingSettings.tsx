"use client";

import { useCallback, useEffect, useState } from "react";
import { formatResetDate, type Allowance, type Plan, type UsageSnapshot } from "@/lib/plans";
import type { PlanId } from "@/lib/types";

interface UsageResponse {
  usage: UsageSnapshot;
  plans: Plan[];
  billingConnected: boolean;
}

function levelFor(allowance: Allowance): "ok" | "warning" | "full" {
  if (allowance.remaining === 0) return "full";
  return allowance.percent >= 80 ? "warning" : "ok";
}

function AllowanceRow({
  label,
  allowance,
  note,
}: {
  label: string;
  allowance: Allowance;
  note?: string;
}) {
  const level = levelFor(allowance);
  return (
    <li className="allowance-row">
      <div className="allowance-meta">
        <dt>{label}</dt>
        <dd>
          {allowance.used} / {allowance.limit}
          {note ? `, ${note}` : ""}
        </dd>
      </div>
      <div
        className="usage-track"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={allowance.limit}
        aria-valuenow={allowance.used}
        aria-valuetext={`${allowance.used} of ${allowance.limit}`}
      >
        <span className="usage-fill" data-level={level} style={{ width: `${allowance.percent}%` }} />
      </div>
    </li>
  );
}

export function BillingSettings() {
  const [data, setData] = useState<UsageResponse | null>(null);
  const [busy, setBusy] = useState<PlanId | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/usage");
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || "Could not load usage");
    return body as UsageResponse;
  }, []);

  useEffect(() => {
    let cancelled = false;
    load()
      .then((body) => { if (!cancelled) setData(body); })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : "Could not load usage"); });
    return () => { cancelled = true; };
  }, [load]);

  async function choosePlan(plan: Plan) {
    setBusy(plan.id);
    setMessage("");
    setError("");
    try {
      const res = await fetch("/api/usage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: plan.id }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Could not change plan");
      setData(body as UsageResponse);
      setMessage(`You are now on the ${plan.name} plan, ${plan.documentsPerMonth} documents a month.`);
      window.dispatchEvent(new Event("extracto:usage"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not change plan");
    } finally {
      setBusy(null);
    }
  }

  const usage = data?.usage;
  return (
    <section className="grid gap-5 border-t border-rule pt-5" aria-labelledby="billing-heading" id="billing">
      <div>
        <h2 id="billing-heading">Plan and usage</h2>
        <p className="mt-1 text-sm text-muted">
          A document counts once, when we accept it for extraction, so retries and duplicates are free.
          Allowances reset on the first of each month.
        </p>
      </div>

      {error && <p role="alert" className="text-sm text-error">{error}</p>}
      {message && <p role="status" className="text-sm text-ink-2">{message}</p>}
      {!usage && !error && <p className="text-sm text-muted" aria-busy="true">Loading usage…</p>}

      {usage && (
        <>
          <div className="usage-panel" data-level={usage.level}>
            <div className="usage-head">
              <div>
                <h3>Documents this month</h3>
                <p className="text-sm text-muted">
                  {usage.planName} plan
                </p>
              </div>
              <p className="usage-figure">
                <strong>{usage.documents.used}</strong> of {usage.documents.limit}
              </p>
            </div>
            <div
              className="usage-track"
              role="progressbar"
              aria-label="Documents processed this month"
              aria-valuemin={0}
              aria-valuemax={usage.documents.limit}
              aria-valuenow={usage.documents.used}
              aria-valuetext={`${usage.documents.used} of ${usage.documents.limit} documents used`}
            >
              <span className="usage-fill" data-level={usage.level} style={{ width: `${usage.documents.percent}%` }} />
            </div>
            <p className="usage-note">
              {usage.level === "full"
                ? `Allowance used. Processing resumes ${formatResetDate(usage.resetsAt)}; switch plans to keep going now.`
                : usage.level === "warning"
                  ? `${usage.documents.remaining} ${usage.documents.remaining === 1 ? "document" : "documents"} left. Resets ${formatResetDate(usage.resetsAt)}.`
                  : `Resets ${formatResetDate(usage.resetsAt)}.`}
            </p>
          </div>

          <div className="grid gap-3">
            <div className="section-heading">
              <h3 className="text-md font-medium text-ink">Other account limits</h3>
            </div>
            <dl className="allowance-list">
              <AllowanceRow label="Workspaces you own" allowance={usage.workspaces} />
              <AllowanceRow label="Saved exports" allowance={usage.savedExports} />
            </dl>
            <p className="text-xs text-muted">
              Files up to {usage.maxFileMb} MB, up to {usage.membersPerWorkspace} members per workspace.
            </p>
          </div>

          <div className="grid gap-3 border-t border-rule pt-4">
            <div className="section-heading">
              <h3 className="text-md font-medium text-ink">Plans</h3>
            </div>
            <div className="plan-grid">
              {data.plans.map((plan) => {
                const isCurrent = plan.id === usage.plan;
                return (
                  <article className="plan-card" key={plan.id} data-current={isCurrent}>
                    <div className="plan-name">
                      {plan.name}
                      {isCurrent && <span className="status-chip" data-status="reviewed">Current</span>}
                    </div>
                    <p className="plan-price">
                      ${plan.priceMonthly}
                      <small> / month</small>
                    </p>
                    <p className="text-xs text-muted">{plan.summary}</p>
                    <ul className="plan-features">
                      {plan.features.map((feature) => (
                        <li key={feature}>{feature}</li>
                      ))}
                    </ul>
                    {!isCurrent && (
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => void choosePlan(plan)}
                        disabled={busy !== null}
                      >
                        {busy === plan.id ? "Switching…" : `Switch to ${plan.name}`}
                      </button>
                    )}
                  </article>
                );
              })}
            </div>
            {data.billingConnected ? null : (
              <p className="text-xs text-muted">
                No payment method is needed while Extracto is in preview: plan changes apply
                immediately and nothing is charged. Checkout arrives once the workflow is settled.
              </p>
            )}
          </div>
        </>
      )}
    </section>
  );
}
