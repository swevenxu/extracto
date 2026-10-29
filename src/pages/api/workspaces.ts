import type { NextApiRequest, NextApiResponse } from "next";
import { currentUserFromCookie } from "@/lib/session";
import {
  createWorkspace,
  getActiveWorkspace,
  listWorkspacesForUser,
  setActiveWorkspace,
  workspaceMembers,
  workspaceRole,
} from "@/lib/storage";

/**
 * GET  → { workspace, workspaces, members } for the signed-in member
 * POST { name } → create a workspace, join it, and make it active
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await currentUserFromCookie(req.headers.cookie);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  if (req.method === "GET") {
    const active = getActiveWorkspace(user);
    res.status(200).json({
      workspace: {
        id: active.id,
        name: active.name,
        role: workspaceRole(active, user.id),
        memberCount: active.members.length,
      },
      workspaces: listWorkspacesForUser(user).map((workspace) => ({
        id: workspace.id,
        name: workspace.name,
        role: workspaceRole(workspace, user.id),
        memberCount: workspace.members.length,
      })),
      members: workspaceMembers(active.id),
    });
    return;
  }

  if (req.method === "POST") {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 60) : "";
    if (!name) {
      res.status(400).json({ error: "Give the workspace a name" });
      return;
    }

    try {
      const workspace = createWorkspace(name, user);
      setActiveWorkspace(user.id, workspace.id);
      res.status(201).json({
        workspace: {
          id: workspace.id,
          name: workspace.name,
          role: "owner",
          memberCount: workspace.members.length,
        },
        members: workspaceMembers(workspace.id),
      });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : "Could not create workspace" });
    }
    return;
  }

  res.setHeader("Allow", "GET, POST");
  res.status(405).json({ error: "Method not allowed" });
}
