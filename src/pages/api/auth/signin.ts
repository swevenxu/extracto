import type { NextApiRequest, NextApiResponse } from "next";
import { createSession } from "@/lib/session";
import { authenticateUser, createUser } from "@/lib/storage";
import type { User } from "@/lib/types";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const { email, name, password, mode } = body as Partial<User> & { email: string; password?: string; mode?: string };
  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || typeof password !== "string" || password.length < 10 || password.length > 200) {
    res.status(400).json({ error: "Enter a valid email and a password of at least 10 characters" });
    return;
  }

  try {
    let user: User | undefined;
    if (mode === "signup") {
      user = await createUser(email, typeof name === "string" ? name.trim().slice(0, 80) || email.split("@")[0] : email.split("@")[0], password);
    } else {
      user = await authenticateUser(email, password);
    }
    if (!user) {
      res.status(401).json({ error: "Email or password is incorrect" });
      return;
    }

    const token = await createSession(user);
    res.setHeader("Set-Cookie", `session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${60 * 60 * 24 * 7}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);

    res.status(200).json({ user });
  } catch (error) {
    if (error instanceof Error && error.message === "User already exists") {
      res.status(409).json({ error: "An account with this email already exists" });
      return;
    }
    console.error("Authentication request failed", error);
    res.status(500).json({ error: "Authentication service is temporarily unavailable" });
  }
}
