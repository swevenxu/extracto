import type { NextApiRequest, NextApiResponse } from "next";
import { currentUserFromCookie } from "@/lib/session";
import { getWorkspaceForUser, setActiveWorkspace, workspaceRole } from "@/lib/storage";

/** POST { workspaceId } → switch the active workspace (members only). */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await currentUserFromCookie(req.headers.cookie);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId : "";
  const workspace = workspaceId ? getWorkspaceForUser(workspaceId, user.id) : undefined;
  if (!workspace) {
    res.status(404).json({ error: "Workspace not found" });
    return;
  }

  setActiveWorkspace(user.id, workspace.id);
  res.status(200).json({
    workspace: {
      id: workspace.id,
      name: workspace.name,
      role: workspaceRole(workspace, user.id),
      memberCount: workspace.members.length,
    },
  });
}
