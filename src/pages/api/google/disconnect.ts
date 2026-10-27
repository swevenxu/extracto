import type { NextApiRequest, NextApiResponse } from "next";
import { deleteTokensForUser } from "@/lib/google";
import { currentUserFromCookie } from "@/lib/session";

/**
 * Disconnect the user's Google Sheets account (revokes stored tokens).
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const user = await currentUserFromCookie(req.headers.cookie);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  deleteTokensForUser(user.id);
  res.status(200).json({ ok: true });
}