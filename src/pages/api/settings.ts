import type { NextApiRequest, NextApiResponse } from "next";
import { currentUserFromCookie } from "@/lib/session";
import { getPreferences, updatePreferences } from "@/lib/storage";
import type { Currency } from "@/lib/types";
import { BASE_CURRENCIES } from "@/lib/currency";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await currentUserFromCookie(req.headers.cookie);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  if (req.method === "GET") {
    const prefs = getPreferences(user.id);
    res.status(200).json({
      baseCurrency: prefs?.baseCurrency || "USD",
      locale: prefs?.locale || "en-US",
      availableCurrencies: BASE_CURRENCIES,
    });
    return;
  }

  if (req.method === "PATCH") {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const patch: Partial<{ baseCurrency: Currency; locale: string }> = {};

    if (body.baseCurrency && BASE_CURRENCIES.includes(body.baseCurrency)) {
      patch.baseCurrency = body.baseCurrency;
    }
    if (body.locale && typeof body.locale === "string") {
      patch.locale = body.locale.slice(0, 10);
    }

    const updated = updatePreferences(user.id, patch);
    res.status(200).json({
      baseCurrency: updated.baseCurrency,
      locale: updated.locale,
      availableCurrencies: BASE_CURRENCIES,
    });
    return;
  }

  res.setHeader("Allow", "GET, PATCH");
  res.status(405).json({ error: "Method not allowed" });
}