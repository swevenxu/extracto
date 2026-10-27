import { listRecordsByUser } from "@/lib/storage";
import { currentUserFromCookie } from "@/lib/session";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  const user = await currentUserFromCookie(req.headers.cookie);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  res.status(200).json({ records: listRecordsByUser(user.id) });
}
