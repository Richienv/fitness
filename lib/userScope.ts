// Per-user localStorage namespacing. Every data module routes its storage
// keys through `scopedKey()` so User B never sees User A's cache on a shared
// device. The active user id is set once on the client from the server
// session (see app/UserScopeInit.tsx) before any data-reading effect runs.

let activeUserId: string | null = null;

export function setActiveUser(id: string | null): void {
  activeUserId = id;
}

export function getActiveUser(): string | null {
  return activeUserId;
}

/** Namespace a base storage key to the active user. When signed out (no
 *  active user) the base key is returned unchanged — but signed-out users
 *  are redirected to /login by middleware, so no data reads happen then. */
export function scopedKey(base: string): string {
  return activeUserId ? `u:${activeUserId}:${base}` : base;
}

// One-time adoption of a device's pre-auth (un-namespaced) data into the
// first account that logs in on it — so the owner's existing local history
// isn't orphaned when accounts arrive. Only DATA keys are copied; sync/seen
// dedup flags are intentionally left out so the adopted data gets pushed to
// the server for that account.
const ADOPT_FLAG = "richie.legacyAdopted.v1";
const LEGACY_DATA_KEYS = [
  "richie.meals.v1",
  "richie.daily.v1",
  "richie.customfoods.v1",
  "richie.ingredientoverrides.v1",
  "richie.quicklog.v1",
  "richie.sleep.v1",
  "richie.workouts.v1",
  "richie.activeWorkout.v1",
  "richie.customTemplates.v1",
  "richie.settings.v1",
  "richie.measurements.v1",
  "richie.microTargets.v1",
];

export function adoptLegacyDataOnce(userId: string): void {
  if (typeof window === "undefined" || !userId) return;
  try {
    if (window.localStorage.getItem(ADOPT_FLAG)) return;
    for (const base of LEGACY_DATA_KEYS) {
      const legacy = window.localStorage.getItem(base);
      if (legacy == null) continue;
      const scoped = `u:${userId}:${base}`;
      if (window.localStorage.getItem(scoped) == null) {
        window.localStorage.setItem(scoped, legacy);
      }
    }
    window.localStorage.setItem(ADOPT_FLAG, "1");
  } catch {
    /* ignore quota / access errors */
  }
}
