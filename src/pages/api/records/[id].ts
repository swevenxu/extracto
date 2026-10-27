import type { NextApiRequest, NextApiResponse } from "next";
import { currentUserFromCookie } from "@/lib/session";
import { deleteRecord, getRecord, updateRecord } from "@/lib/storage";
import { recordToCsv } from "@/lib/csv";
import type { LineItem } from "@/lib/types";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const user = await currentUserFromCookie(req.headers.cookie);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const id = String(req.query.id || "");
  if (!id) { res.status(400).json({ error: "Missing record id" }); return; }

  if (req.method === "GET") {
    const record = getRecord(id, user.id);
    if (!record) { res.status(404).json({ error: "Not found" }); return; }
    if ((req.headers.accept || "").includes("text/csv")) {
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="extracto-${id}.csv"`);
      res.status(200).send(recordToCsv(record));
    } else res.status(200).json(record);
    return;
  }

  if (req.method === "PATCH") {
    const existing = getRecord(id, user.id);
    if (!existing) { res.status(404).json({ error: "Not found" }); return; }
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const allowed = ["vendor", "invoiceNumber", "issueDate", "dueDate", "currency"];
    const patch: Record<string, unknown> = {};
    for (const key of allowed) if (typeof body[key] === "string") patch[key] = body[key].slice(0, 500);
    for (const key of ["subtotal", "tax", "total"]) {
      if (body[key] !== undefined) {
        const value = Number(body[key]);
        if (!Number.isFinite(value) || value < 0 || value > 1_000_000_000) { res.status(400).json({ error: `Invalid ${key}` }); return; }
        patch[key] = value;
      }
    }
    if (body.lineItems !== undefined) {
      if (!Array.isArray(body.lineItems) || body.lineItems.length > 500) { res.status(400).json({ error: "Invalid line items" }); return; }
      const lineItems: LineItem[] = [];
      for (const item of body.lineItems) {
        if (!item || typeof item.description !== "string") { res.status(400).json({ error: "Invalid line item" }); return; }
        const quantity = Number(item.quantity), unitPrice = Number(item.unitPrice), amount = Number(item.amount);
        if (![quantity, unitPrice, amount].every((n) => Number.isFinite(n) && n >= 0 && n <= 1_000_000_000)) { res.status(400).json({ error: "Invalid line item amounts" }); return; }
        lineItems.push({ description: item.description.slice(0, 500), quantity, unitPrice, amount });
      }
      patch.lineItems = lineItems;
    }
    if (body.status === "reviewed") patch.status = "reviewed";
    const saved = updateRecord(id, patch, user.id);
    if (!saved) { res.status(404).json({ error: "Not found" }); return; }
    res.status(200).json(saved);
    return;
  }

  if (req.method === "DELETE") {
    const deleted = deleteRecord(id, user.id);
    res.status(deleted ? 200 : 404).json(deleted ? { ok: true } : { error: "Not found" });
    return;
  }
  res.setHeader("Allow", "GET, PATCH, DELETE");
  res.status(405).json({ error: "Method not allowed" });
}
