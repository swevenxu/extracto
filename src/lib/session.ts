import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import type { User } from "./types";

export const SESSION_SECRET = process.env.SESSION_SECRET || (process.env.NODE_ENV === "development" || process.env.NEXT_PHASE === "phase-production-build" ? "local-development-session-secret-change-me" : "");
if (!SESSION_SECRET) throw new Error("SESSION_SECRET must be configured outside development");
if (process.env.NODE_ENV !== "development" && Buffer.byteLength(SESSION_SECRET) < 32) throw new Error("SESSION_SECRET must be at least 32 bytes");

const SECRET = new TextEncoder().encode(SESSION_SECRET);
const ALG = "HS256";

export async function createSession(user: User): Promise<string> {
  return await new SignJWT({ id: user.id, email: user.email, name: user.name })
    .setProtectedHeader({ alg: ALG })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(SECRET);
}

export async function readSession(token: string | undefined): Promise<User | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET, { algorithms: [ALG] });
    const { id, email, name } = payload;
    if (typeof id !== "string" || typeof email !== "string" || typeof name !== "string")
      return null;
    return { id, email, name };
  } catch {
    return null;
  }
}

/** Read session from a cookie header string (Pages Router API routes). */
export async function currentUserFromCookie(
  cookieHeader: string | undefined,
): Promise<User | null> {
  if (!cookieHeader) return null;
  // simple split — fine for our single "session" cookie
  const match = cookieHeader.match(/(?:^|;\s*)session=([^;]+)/);
  try {
    const token = match ? decodeURIComponent(match[1]) : undefined;
    return readSession(token);
  } catch {
    return null;
  }
}

export async function currentUser(): Promise<User | null> {
  const token = cookies().get("session")?.value;
  return readSession(token);
}
