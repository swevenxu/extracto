import { retryExtraction } from "@/lib/retry";
import { currentUserFromCookie } from "@/lib/session";

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  const id = String(req.query.id || "");
  if (!id) {
    res.status(400).json({ error: "Missing record id" });
    return;
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const user = await currentUserFromCookie(req.headers.cookie);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  try {
    const record = await retryExtraction(id, user);
    res.status(200).json(record);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "Record not found") res.status(404).json({ error: message });
    else if (message.startsWith("No raw text")) res.status(400).json({ error: message });
    else res.status(500).json({ error: message });
  }
}
