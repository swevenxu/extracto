import type { NextApiRequest, NextApiResponse } from "next";
import { currentUserFromCookie } from "@/lib/session";
import { getActiveWorkspace, getRecord, listActivity } from "@/lib/storage";

/** History for one document, newest first (workspace members only). */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await currentUserFromCookie(req.headers.cookie);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const id = String(req.query.id || "");
  if (!id) { res.status(400).json({ error: "Missing record id" }); return; }

  const workspace = getActiveWorkspace(user);
  const record = getRecord(id, workspace.id);
  if (!record) { res.status(404).json({ error: "Not found" }); return; }

  res.status(200).json({ events: listActivity(workspace.id, id, 100) });
}
