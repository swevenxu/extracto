import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  res.setHeader("Set-Cookie", `session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
  res.status(200).json({ ok: true });
}
