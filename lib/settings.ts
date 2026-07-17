"use client";

import { scopedKey } from "./userScope";

export type MacroTarget = { kcal: number; protein: number; carbs: number; fat: number };

export type Sex = "male" | "female";
export type Goal = "fat_loss" | "recomp" | "muscle_gain" | "maintain";

/** Per-user physiology profile. When `sex`, `heightCm` and `age` are all set
 *  the app derives targets via Mifflin-St Jeor (lib/energy); otherwise it
 *  falls back to the hardcoded `targets` below so existing users are
 *  untouched. `weightKg` here is a fallback — the latest logged measurement
 *  takes precedence when present. */
export type Profile = {
  sex: Sex | null;
  goal: Goal;
  heightCm: number | null;
  age: number | null;
  weightKg: number | null;
  activity: number; // TDEE activity multiplier
  menstrualTrackingEnabled: boolean;
  cycleStartDate: string | null; // YYYY-MM-DD
};

export type UserSettings = {
  targets: { gymDay: MacroTarget; restDay: MacroTarget };
  startDate: string; // YYYY-MM-DD, week 1 of the 12-week block
  profile: Profile;
  // Set once the user hand-edits a daily target. When true the manual targets
  // win over profile-derived numbers everywhere (see lib/targets).
  targetsCustom?: boolean;
};

export const DEFAULT_PROFILE: Profile = {
  sex: null,
  goal: "maintain",
  heightCm: null,
  age: null,
  weightKg: null,
  activity: 1.5,
  menstrualTrackingEnabled: false,
  cycleStartDate: null,
};

export const DEFAULT_SETTINGS: UserSettings = {
  targets: {
    gymDay: { kcal: 2200, protein: 175, carbs: 150, fat: 70 },
    restDay: { kcal: 1700, protein: 175, carbs: 120, fat: 70 },
  },
  startDate: "2026-04-07",
  profile: DEFAULT_PROFILE,
};

export function profileComplete(p: Profile): boolean {
  return !!p.sex && p.heightCm != null && p.age != null;
}

const SETTINGS_KEY = "richie.settings.v1";
const PROTEIN_BUMP_KEY = "richie.settings.proteinBumpV2";

/** One-shot migration: any user still on the old 155g protein target gets
 * silently bumped to the new 175g default. Once flagged, the user is in
 * full control and can edit freely without ever being clobbered again. */
function migrateOldProteinTarget(parsed: Partial<UserSettings>): Partial<UserSettings> {
  if (typeof window === "undefined") return parsed;
  if (window.localStorage.getItem(scopedKey(PROTEIN_BUMP_KEY)) === "1") return parsed;
  const next = { ...parsed };
  const targets = parsed.targets;
  if (targets) {
    const bumped = {
      gymDay: { ...targets.gymDay! },
      restDay: { ...targets.restDay! },
    };
    if (bumped.gymDay.protein === 155) bumped.gymDay.protein = 175;
    if (bumped.restDay.protein === 155) bumped.restDay.protein = 175;
    next.targets = bumped;
    window.localStorage.setItem(scopedKey(SETTINGS_KEY), JSON.stringify(next));
  }
  window.localStorage.setItem(scopedKey(PROTEIN_BUMP_KEY), "1");
  return next;
}

function read(): UserSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(scopedKey(SETTINGS_KEY));
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = migrateOldProteinTarget(JSON.parse(raw) as Partial<UserSettings>);
    return {
      targets: {
        gymDay: { ...DEFAULT_SETTINGS.targets.gymDay, ...(parsed.targets?.gymDay ?? {}) },
        restDay: { ...DEFAULT_SETTINGS.targets.restDay, ...(parsed.targets?.restDay ?? {}) },
      },
      startDate: parsed.startDate || DEFAULT_SETTINGS.startDate,
      profile: { ...DEFAULT_PROFILE, ...(parsed.profile ?? {}) },
      targetsCustom: parsed.targetsCustom ?? false,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function getSettings(): UserSettings {
  return read();
}

export function setSettings(next: UserSettings): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(scopedKey(SETTINGS_KEY), JSON.stringify(next));
}

export function patchSettings(patch: Partial<UserSettings>): UserSettings {
  const cur = read();
  const next: UserSettings = {
    targets: patch.targets ?? cur.targets,
    startDate: patch.startDate ?? cur.startDate,
    profile: patch.profile ? { ...cur.profile, ...patch.profile } : cur.profile,
    targetsCustom: patch.targetsCustom ?? cur.targetsCustom,
  };
  setSettings(next);
  return next;
}

/** Convenience: read the profile, patch a subset, persist. */
export function patchProfile(patch: Partial<Profile>): Profile {
  const next = { ...read().profile, ...patch };
  patchSettings({ profile: next });
  return next;
}

export function getProfile(): Profile {
  return read().profile;
}

export function resetSettings(): UserSettings {
  setSettings(DEFAULT_SETTINGS);
  return DEFAULT_SETTINGS;
}
