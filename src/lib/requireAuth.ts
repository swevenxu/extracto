import type { NextApiRequest, NextApiResponse } from "next";
import { currentUserFromCookie } from "@/lib/session";
import type { User } from "@/lib/types";

export type WithUser<Q = unknown, B = unknown> = Parameters<
  (req: NextApiRequest, res: NextApiResponse, user: User) => void
>[0] & {
  user: User;
};

type AuthedHandler = (
  req: (NextApiRequest & { user: User }) | NextApiRequest,
  res: NextApiResponse,
  user: User
) => void;

/** Wrap an API handler so it requires a logged-in user. */
export function requireAuth(
  handler: (req: NextApiRequest & { user: User }, res: NextApiResponse) => void
) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    const user = await currentUserFromCookie(req.headers.cookie);
    if (!user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    (req as NextApiRequest & { user: User }).user = user;
    return handler(req as NextApiRequest & { user: User }, res);
  };
}

export type RequireAuthHandler = AuthedHandler;
