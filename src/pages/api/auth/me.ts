import type { NextApiRequest, NextApiResponse } from "next";
import { currentUserFromCookie } from "@/lib/session";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const user = await currentUserFromCookie(req.headers.cookie);
  if (!user) {
    res.status(401).json({ user: null });
    return;
  }
  res.status(200).json({ user });
}
