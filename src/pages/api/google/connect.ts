import type { NextApiRequest, NextApiResponse } from "next";
import { getAuthUrl } from "@/lib/google";
import { currentUserFromCookie } from "@/lib/session";

/**
 * Starts the Google Sheets OAuth flow.
 *
 * Returns a 401 if the user is not logged in (via session cookie).
 * On success, redirects to the Google consent screen.
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

  try {
    const url = await getAuthUrl(user.id);
    res.redirect(302, url);
  } catch (err) {
    res.status(500).json({
      error: `Google OAuth not configured: ${(err as Error).message}`,
    });
  }
}
