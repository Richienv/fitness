import type { Character } from "./companionProgress";

const KEY = "r2.deviceAccount.v1";
export function deviceAccount(): Character | null {
  try {
    const value = localStorage.getItem(KEY);
    return value === "richie" || value === "renita" ? value : null;
  } catch { return null; }
}
// A convenience for this phone, never an authentication or data-access claim.
export function rememberAccount(person: Character) {
  try { localStorage.setItem(KEY, person); } catch {}
}
