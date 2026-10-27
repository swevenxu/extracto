import type { NextApiRequest, NextApiResponse } from "next";
import { hasGoogleToken } from "@/lib/google";
import { currentUserFromCookie } from "@/lib/session";

/**
 * Check if the current user has a Google Sheets connection.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const user = await currentUserFromCookie(req.headers.cookie);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const connected = hasGoogleToken(user.id);
  res.status(200).json({ connected });
}