// Username rules, shared by the client (live validation) and the server
// (authoritative check). Handles are always stored lowercase so the unique
// index behaves case-insensitively — @Richie and @richie are the same person.

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;

/** Strip a leading @ and lowercase. Does NOT validate. */
export function normalizeUsername(raw: string): string {
  return raw.trim().replace(/^@+/, "").toLowerCase();
}

// Reserved so handles can't impersonate the app or shadow future routes.
const RESERVED = new Set([
  "admin", "root", "system", "support", "help", "api", "app", "r2fit",
  "hermes", "settings", "login", "register", "social", "meal", "workout",
  "me", "you", "null", "undefined", "anonymous",
]);

/** Returns null when valid, else a Bahasa reason to show the user. */
export function usernameError(raw: string): string | null {
  const u = normalizeUsername(raw);
  if (u.length === 0) return "Username belum diisi.";
  if (u.length < USERNAME_MIN) return `Minimal ${USERNAME_MIN} karakter.`;
  if (u.length > USERNAME_MAX) return `Maksimal ${USERNAME_MAX} karakter.`;
  if (!/^[a-z0-9_]+$/.test(u)) return "Cuma huruf, angka, dan _ ya.";
  if (/^[0-9_]/.test(u)) return "Harus diawali huruf.";
  if (RESERVED.has(u)) return "Username itu sudah dipesan sistem.";
  return null;
}

export function isValidUsername(raw: string): boolean {
  return usernameError(raw) === null;
}

/** Display form with the @ prefix. */
export function atHandle(username: string | null | undefined): string {
  return username ? `@${username}` : "";
}
