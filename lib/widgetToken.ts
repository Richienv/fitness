// Stateless, per-user token for the read-only widget endpoint (iOS Scriptable).
//
// A widget can't carry the NextAuth session cookie, so it authenticates with a
// signed token instead: base64url(payload).base64url(HMAC-SHA256(payload)).
// The payload is { u: userId, exp: epochMs }. Signed with the same AUTH secret
// NextAuth already uses — no new env var, no DB table. Verification is a
// constant-time signature compare plus an expiry check, yielding the userId.
//
// Server-only (uses node:crypto). Revoke-all = rotate AUTH_SECRET.

import crypto from "node:crypto";

const DEFAULT_TTL_DAYS = 180;

function secret(): string {
  const s = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET / NEXTAUTH_SECRET not configured");
  return s;
}

function b64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromB64url(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function sign(payload: string): string {
  return b64url(crypto.createHmac("sha256", secret()).update(payload).digest());
}

/** Mint a signed widget token for a user (default 180-day expiry). */
export function signWidgetToken(userId: string, ttlDays = DEFAULT_TTL_DAYS): string {
  const exp = Date.now() + ttlDays * 24 * 60 * 60 * 1000;
  const payload = b64url(Buffer.from(JSON.stringify({ u: userId, exp })));
  return `${payload}.${sign(payload)}`;
}

/** Verify a widget token; return the userId, or null if invalid/expired. */
export function verifyWidgetToken(token: string | null | undefined): string | null {
  if (!token || typeof token !== "string") return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const providedSig = token.slice(dot + 1);

  let expectedSig: string;
  try {
    expectedSig = sign(payload);
  } catch {
    return null;
  }
  const a = Buffer.from(providedSig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const obj = JSON.parse(fromB64url(payload).toString("utf8")) as {
      u?: unknown;
      exp?: unknown;
    };
    if (typeof obj.u !== "string" || !obj.u) return null;
    if (typeof obj.exp !== "number" || Date.now() > obj.exp) return null;
    return obj.u;
  } catch {
    return null;
  }
}
