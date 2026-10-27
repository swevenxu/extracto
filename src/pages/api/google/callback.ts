import type { NextApiRequest, NextApiResponse } from "next";
import { makeClient, jwtDecodeState, saveTokensForUser } from "@/lib/google";
import { currentUserFromCookie } from "@/lib/session";

/**
 * Google OAuth redirect target.
 *
 * Validates the signed `state` (which must match the session user),
 * exchanges the code for tokens, stores them encrypted, and redirects
 * back to the app.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  const { code, state, error } = req.query as {
    code?: string;
    state?: string;
    error?: string;
  };

  const fail = (msg: string) =>
    res.redirect(
      302,
      `${process.env.NEXT_PUBLIC_URL ?? "http://localhost:3000"}/documents?google=${encodeURIComponent(msg)}`,
    );

  if (error) return fail(`Google returned: ${error}`);
  if (!code || !state) return fail("Missing code or state");

  // The signed state must name the same user as the session — this
  // prevents using one user's consent flow to inject tokens into
  // another user's account.
  const user = await currentUserFromCookie(req.headers.cookie);
  if (!user) return fail("Session expired — sign in again");

  const stateUserId = await jwtDecodeState(state);
  if (!stateUserId || stateUserId !== user.id) return fail("State mismatch");

  try {
    const client = makeClient();
    const { tokens } = await client.getToken(code);
    if (!tokens.access_token) throw new Error("no access token");
    await saveTokensForUser(user.id, {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? "",
      scope: tokens.scope ?? "",
      token_type: tokens.token_type ?? "Bearer",
      expiry_date: tokens.expiry_date ?? 0,
    });
    res.redirect(302, `${process.env.NEXT_PUBLIC_URL ?? "http://localhost:3000"}/documents?google=connected`);
  } catch (err) {
    fail(`OAuth error: ${(err as Error).message}`);
  }
}
