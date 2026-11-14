import { createHmac } from "node:crypto";
export function loginPerson(value: unknown): "richie" | "renita" | null {
  return value === "richie" || value === "renita" ? value : null;
}
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_LIMIT = 8;
export function loginBucket(address: string, secret: string, now = Date.now()) {
  const window = Math.floor(now / LOGIN_WINDOW_MS);
  return {
    key: createHmac("sha256", secret)
      .update(`${address}:${window}`)
      .digest("hex"),
    expiresAt: new Date((window + 1) * LOGIN_WINDOW_MS),
  };
}
