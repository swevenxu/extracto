import type { NextApiRequest, NextApiResponse } from "next";
import { recordsToCsv } from "@/lib/csv";
import { getActiveWorkspace, listRecordsByWorkspace } from "@/lib/storage";
import { currentUserFromCookie } from "@/lib/session";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  const user = await currentUserFromCookie(req.headers.cookie);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const workspace = getActiveWorkspace(user);
  const csv = recordsToCsv(listRecordsByWorkspace(workspace.id).filter((record) => record.status === "reviewed"));
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="extracto-records.csv"`);
  res.status(200).send(csv);
}
