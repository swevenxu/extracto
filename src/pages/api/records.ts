import type { NextApiRequest, NextApiResponse } from "next";
import { getActiveWorkspace, listRecordsByWorkspace, workspaceMembers, workspaceRole } from "@/lib/storage";
import { currentUserFromCookie } from "@/lib/session";

/** Records and members of the active workspace. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  const user = await currentUserFromCookie(req.headers.cookie);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const workspace = getActiveWorkspace(user);
  res.status(200).json({
    records: listRecordsByWorkspace(workspace.id),
    workspace: {
      id: workspace.id,
      name: workspace.name,
      role: workspaceRole(workspace, user.id),
      memberCount: workspace.members.length,
    },
    members: workspaceMembers(workspace.id),
  });
}
