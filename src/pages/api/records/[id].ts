import type { NextApiRequest, NextApiResponse } from "next";
import { currentUserFromCookie } from "@/lib/session";
import {
  deleteRecord,
  getActiveWorkspace,
  getRecord,
  updateRecord,
  workspaceMembers,
} from "@/lib/storage";
import { recordToCsv } from "@/lib/csv";
import { coerceFieldPatch, coerceRows, isDocType, presetFor } from "@/lib/docTypes";
import { describeChanges, diffRecord, recordActivity } from "@/lib/audit";
import type { ExtractedRecord } from "@/lib/types";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await currentUserFromCookie(req.headers.cookie);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = String(req.query.id || "");
  if (!id) { res.status(400).json({ error: "Missing record id" }); return; }

  // Every operation is scoped to the workspace the member is currently in.
  const workspace = getActiveWorkspace(user);

  if (req.method === "GET") {
    const record = getRecord(id, workspace.id);
    if (!record) { res.status(404).json({ error: "Not found" }); return; }
    if ((req.headers.accept || "").includes("text/csv")) {
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="extracto-${id}.csv"`);
      res.status(200).send(recordToCsv(record));
    } else res.status(200).json(record);
    return;
  }

  if (req.method === "PATCH") {
    const existing = getRecord(id, workspace.id);
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const patch: Partial<ExtractedRecord> = {};

    if (body.docType !== undefined) {
      if (!isDocType(body.docType)) { res.status(400).json({ error: "Unknown document type" }); return; }
      patch.docType = body.docType;
    }

    if (body.fields !== undefined) {
      try {
        // Merge, so values belonging to another preset survive a type switch.
        patch.fields = { ...existing.fields, ...coerceFieldPatch(body.fields) };
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : "Invalid fields" });
        return;
      }
    }

    if (body.rows !== undefined) {
      if (!Array.isArray(body.rows) || body.rows.length > 500) { res.status(400).json({ error: "Invalid rows" }); return; }
      const preset = presetFor(patch.docType ?? existing.docType);
      patch.rows = coerceRows(preset, body.rows);
    }

    // Assignment: a member of this workspace, or null/"" to unassign.
    let assigneeName: string | undefined;
    const assigneeProvided = Object.prototype.hasOwnProperty.call(body, "assigneeId");
    if (assigneeProvided) {
      const raw = body.assigneeId;
      if (raw === null || raw === undefined || raw === "") {
        patch.assigneeId = undefined;
      } else {
        if (typeof raw !== "string") { res.status(400).json({ error: "Invalid assignee" }); return; }
        const member = workspaceMembers(workspace.id).find((candidate) => candidate.userId === raw);
        if (!member) { res.status(400).json({ error: "Assignee must be a member of this workspace" }); return; }
        patch.assigneeId = member.userId;
        assigneeName = member.name;
      }
    }

    if (body.status === "reviewed") patch.status = "reviewed";

    const changes = diffRecord(existing, patch);
    const assigneeChanged = assigneeProvided && (patch.assigneeId ?? undefined) !== (existing.assigneeId ?? undefined);
    if (changes.length === 0 && !assigneeChanged) {
      res.status(200).json(existing);
      return;
    }

    patch.updatedBy = user.id;
    patch.updatedAt = new Date().toISOString();

    const saved = updateRecord(id, patch, workspace.id);
    if (!saved) { res.status(404).json({ error: "Not found" }); return; }

    const previousAssignee = existing.assigneeId
      ? workspaceMembers(workspace.id).find((member) => member.userId === existing.assigneeId)?.name
      : undefined;

    if (assigneeChanged) {
      recordActivity({
        workspaceId: workspace.id,
        record: existing,
        actor: user,
        type: "assigned",
        summary: assigneeName ? `Assigned to ${assigneeName}` : "Unassigned",
        changes: [{ field: "Assignee", from: previousAssignee ?? "—", to: assigneeName ?? "—" }],
      });
    }

    if (changes.length > 0) {
      recordActivity({
        workspaceId: workspace.id,
        record: existing,
        actor: user,
        type: patch.status === "reviewed" ? "reviewed" : "updated",
        summary: patch.status === "reviewed" ? "Marked reviewed" : `Updated ${describeChanges(changes)}`.slice(0, 220),
        changes,
      });
    }

    res.status(200).json(saved);
    return;
  }

  if (req.method === "DELETE") {
    const existing = getRecord(id, workspace.id);
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }
    const deleted = deleteRecord(id, workspace.id);
    if (!deleted) { res.status(404).json({ error: "Not found" }); return; }
    recordActivity({
      workspaceId: workspace.id,
      record: existing,
      actor: user,
      type: "deleted",
      summary: `Deleted ${existing.fileName}`,
    });
    res.status(200).json({ ok: true });
    return;
  }
  res.setHeader("Allow", "GET, PATCH, DELETE");
  res.status(405).json({ error: "Method not allowed" });
}
