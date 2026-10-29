import type { NextApiRequest, NextApiResponse } from "next";
import { currentUserFromCookie } from "@/lib/session";
import { getActiveWorkspace, getRecord } from "@/lib/storage";
import { readDocument } from "@/lib/fileStore";

const MIME: Record<string, string> = {
  pdf: "application/pdf",
  txt: "text/plain; charset=utf-8",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await currentUserFromCookie(req.headers.cookie);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = String(req.query.id || "");
  if (!id || !/^[\w-]+$/.test(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  // Records are scoped to a workspace, the same one the review page resolves.
  const workspace = getActiveWorkspace(user);
  const record = getRecord(id, workspace.id);
  if (!record) { res.status(404).json({ error: "Not found" }); return; }

  const bytes = await readDocument(id);
  if (!bytes) { res.status(404).json({ error: "File not found" }); return; }

  const ext = record.fileName.split(".").pop()?.toLowerCase() || "pdf";
  res.setHeader("Content-Type", MIME[ext] || "application/octet-stream");
  res.setHeader("Content-Length", bytes.length);
  res.setHeader("Cache-Control", "no-store");
  res.status(200).send(bytes);
}
