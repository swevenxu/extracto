import type { NextApiRequest, NextApiResponse } from "next";
import { currentUserFromCookie } from "@/lib/session";
import {
  addWorkspaceMember,
  getActiveWorkspace,
  removeWorkspaceMember,
  workspaceMembers,
  workspaceRole,
} from "@/lib/storage";

/**
 * Members of the active workspace. Owners add reviewers by email; owners can
 * remove reviewers but never another owner.
 *
 * POST { action: "add", email } | { action: "remove", userId }
 */
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

  const workspace = getActiveWorkspace(user);
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const action = body.action;

  try {
    if (action === "add") {
      const email = typeof body.email === "string" ? body.email.trim() : "";
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        res.status(400).json({ error: "Enter a valid email address" });
        return;
      }
      addWorkspaceMember(workspace.id, user.id, email);
    } else if (action === "remove") {
      const userId = typeof body.userId === "string" ? body.userId : "";
      if (!userId) {
        res.status(400).json({ error: "Missing member" });
        return;
      }
      removeWorkspaceMember(workspace.id, user.id, userId);
    } else {
      res.status(400).json({ error: "Unknown action" });
      return;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not update members";
    res.status(/Only a workspace owner/i.test(message) ? 403 : 400).json({ error: message });
    return;
  }

  res.status(200).json({
    members: workspaceMembers(workspace.id),
    role: workspaceRole(workspace, user.id),
  });
}
