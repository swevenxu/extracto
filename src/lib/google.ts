/**
 * Google OAuth helper for Sheets export.
 *
 * Tokens are encrypted (AES-256-GCM) and stored on the user record
 * in `users.json`. Only the `spreadsheets` scope is requested —
 * users supply their own spreadsheet ID, so no Drive access is needed.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import { SignJWT, jwtVerify } from "jose";
import { SESSION_SECRET } from "@/lib/session";
import type { User } from "@/lib/types";

const REDIRECT_URI = `${process.env.NEXT_PUBLIC_URL}/api/google/callback`;

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

/** Fresh OAuth2 client — tokens are set per-request from encrypted storage. */
export function makeClient(): OAuth2Client {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    REDIRECT_URI,
  );
}

/** Build the Google consent URL; `state` ties the callback to a user. */
export async function getAuthUrl(userId: string): Promise<string> {
  const client = makeClient();
  return client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    state: await jwtEncodeState(userId),
  });
}

export interface StoredTokens {
  access_token: string;
  refresh_token: string;
  scope: string;
  token_type: string;
  expiry_date: number;
}

function encryptionKey(): Buffer {
  const key = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
  if (!key || Buffer.byteLength(key, "utf8") < 32) {
    throw new Error(
      "GOOGLE_TOKEN_ENCRYPTION_KEY must be set and at least 32 bytes",
    );
  }
  return Buffer.from(key.slice(0, 32), "utf8");
}

function encryptToken(json: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const enc = cipher.update(json, "utf8", "base64") + cipher.final("base64");
  const tag = cipher.getAuthTag().toString("base64");
  return `${iv.toString("base64")}:${tag}:${enc}`;
}

function decryptToken(bundled: string): string {
  const parts = bundled.split(":");
  const legacy = parts.length === 2;
  const [ivPart, tag, enc] = legacy ? ["", parts[0], parts[1]] : parts;
  if (!tag || !enc) throw new Error("corrupt token bundle");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    legacy ? Buffer.alloc(16) : Buffer.from(ivPart, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return decipher.update(enc, "base64", "utf8") + decipher.final("utf8");
}

async function refreshIfNeeded(
  tokens: StoredTokens,
): Promise<StoredTokens | null> {
  if (!tokens.refresh_token) return null;
  const client = makeClient();
  client.setCredentials({ refresh_token: tokens.refresh_token });
  try {
    const { token } = await client.getAccessToken();
    const newTok = token as { access_token?: string; expiry_date?: number };
    return {
      access_token: newTok.access_token ?? tokens.access_token,
      refresh_token: tokens.refresh_token,
      scope: tokens.scope,
      token_type: tokens.token_type,
      expiry_date: newTok.expiry_date ?? tokens.expiry_date,
    };
  } catch {
    return null; // revoked or unrefreshable
  }
}

// --- state JWT: bind the OAuth callback to the user who started it ---

async function jwtEncodeState(userId: string): Promise<string> {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(Buffer.from(SESSION_SECRET));
}

export async function jwtDecodeState(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, Buffer.from(SESSION_SECRET), {
      algorithms: ["HS256"],
    });
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

// --- user-scoped token persistence ---
//
// Tokens live in the user record's `googleToken` field (AES-256-GCM
// encrypted). All access goes through these functions, which also
// transparently refresh near-expiry tokens and drop revoked ones.

import { readUsers, writeUsers } from "@/lib/storage";

function findUserIndex(userId: string): number {
  return readUsers().findIndex((u) => u.id === userId);
}

export function hasGoogleToken(userId: string): boolean {
  const u = readUsers().find((x) => x.id === userId) as
    | { googleToken?: string }
    | undefined;
  return Boolean(u?.googleToken);
}

export async function saveTokensForUser(
  userId: string,
  tokens: StoredTokens,
): Promise<void> {
  const users = readUsers();
  const idx = users.findIndex((u) => u.id === userId);
  if (idx < 0) throw new Error("user not found");
  const next = users.map((u, i) =>
    i === idx ? { ...u, googleToken: encryptToken(JSON.stringify(tokens)) } : u,
  );
  writeUsers(next as Parameters<typeof writeUsers>[0]);
}

export async function getTokensForUser(
  userId: string,
): Promise<StoredTokens | null> {
  const user = readUsers().find((u) => u.id === userId) as
    | { googleToken?: string }
    | undefined;
  if (!user?.googleToken) return null;
  let tokens: StoredTokens;
  try {
    tokens = JSON.parse(decryptToken(user.googleToken)) as StoredTokens;
  } catch {
    return null; // corrupt bundle
  }
  if (user.googleToken.split(":").length === 2) await saveTokensForUser(userId, tokens);
  const expiry = tokens.expiry_date;
  if (!isNaN(expiry) && Date.now() > expiry - 60_000) {
    const refreshed = await refreshIfNeeded(tokens);
    if (!refreshed) {
      // refresh failed: treat as revoked, drop the stored token
      deleteTokensForUser(userId);
      return null;
    }
    await saveTokensForUser(userId, refreshed);
    return refreshed;
  }
  return tokens;
}

export function deleteTokensForUser(userId: string): void {
  const users = readUsers();
  const idx = users.findIndex((u) => u.id === userId);
  if (idx < 0) return;
  const next = users.map((u, i) => {
    if (i !== idx) return u;
    const { googleToken: _drop, ...rest } = u as unknown as Record<
      string,
      unknown
    >;
    return rest as unknown as User;
  });
  writeUsers(next as Parameters<typeof writeUsers>[0]);
}
