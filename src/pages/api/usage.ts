import type { NextApiRequest, NextApiResponse } from "next";
import { currentUserFromCookie } from "@/lib/session";
import { PLAN_IDS, PLANS, isPlanId } from "@/lib/plans";
import { getUsage, setPlan } from "@/lib/usage";

/** Plan entitlements for the account, plus every plan it can move to. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await currentUserFromCookie(req.headers.cookie);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  if (req.method === "GET") {
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({
      usage: getUsage(user),
      plans: PLAN_IDS.map((id) => PLANS[id]),
      // Checkout is not wired up: a plan change is an entitlement, not a payment.
      billingConnected: false,
    });
    return;
  }

  if (req.method === "POST") {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    if (!isPlanId(body.plan)) {
      res.status(400).json({ error: "Unknown plan" });
      return;
    }
    setPlan(user.id, body.plan);
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({
      usage: getUsage(user),
      plans: PLAN_IDS.map((id) => PLANS[id]),
      billingConnected: false,
    });
    return;
  }

  res.setHeader("Allow", "GET, POST");
  res.status(405).json({ error: "Method not allowed" });
}
