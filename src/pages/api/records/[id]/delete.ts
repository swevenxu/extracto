import type { NextApiRequest, NextApiResponse } from "next";
import { currentUserFromCookie } from "@/lib/session";
import { getActiveWorkspace, getRecord } from "@/lib/storage";
import { deleteRecord } from "@/lib/storage";
import { recordActivity } from "@/lib/audit";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await currentUserFromCookie(req.headers.cookie);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  if (req.method !== "DELETE") {
    res.setHeader("Allow", "DELETE");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const id = String(req.query.id || "");
  if (!id) {
    res.status(400).json({ error: "Missing record id" });
    return;
  }

  const workspace = getActiveWorkspace(user);
  const record = getRecord(id, workspace.id);
  if (!record) {
    res.status(404).json({ error: "Record not found" });
    return;
  }

  if (!deleteRecord(id, workspace.id)) {
    res.status(404).json({ error: "Record not found" });
    return;
  }

  recordActivity({
    workspaceId: workspace.id,
    record,
    actor: user,
    type: "deleted",
    summary: `Deleted ${record.fileName}`,
  });

  res.status(200).json({ success: true });
}
