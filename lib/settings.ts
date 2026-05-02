"use client";

export type MacroTarget = { kcal: number; protein: number; carbs: number; fat: number };

export type UserSettings = {
  targets: { gymDay: MacroTarget; restDay: MacroTarget };
  startDate: string; // YYYY-MM-DD, week 1 of the 12-week block
};

export const DEFAULT_SETTINGS: UserSettings = {
  targets: {
    gymDay: { kcal: 2200, protein: 175, carbs: 150, fat: 70 },
    restDay: { kcal: 1700, protein: 175, carbs: 120, fat: 70 },
  },
  startDate: "2026-04-07",
};

const SETTINGS_KEY = "richie.settings.v1";
const PROTEIN_BUMP_KEY = "richie.settings.proteinBumpV2";

/** One-shot migration: any user still on the old 155g protein target gets
 * silently bumped to the new 175g default. Once flagged, the user is in
 * full control and can edit freely without ever being clobbered again. */
function migrateOldProteinTarget(parsed: Partial<UserSettings>): Partial<UserSettings> {
  if (typeof window === "undefined") return parsed;
  if (window.localStorage.getItem(PROTEIN_BUMP_KEY) === "1") return parsed;
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
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  }
  window.localStorage.setItem(PROTEIN_BUMP_KEY, "1");
  return next;
}

function read(): UserSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = migrateOldProteinTarget(JSON.parse(raw) as Partial<UserSettings>);
    return {
      targets: {
        gymDay: { ...DEFAULT_SETTINGS.targets.gymDay, ...(parsed.targets?.gymDay ?? {}) },
        restDay: { ...DEFAULT_SETTINGS.targets.restDay, ...(parsed.targets?.restDay ?? {}) },
      },
      startDate: parsed.startDate || DEFAULT_SETTINGS.startDate,
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
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
}

export function patchSettings(patch: Partial<UserSettings>): UserSettings {
  const cur = read();
  const next: UserSettings = {
    targets: patch.targets ?? cur.targets,
    startDate: patch.startDate ?? cur.startDate,
  };
  setSettings(next);
  return next;
}

export function resetSettings(): UserSettings {
  setSettings(DEFAULT_SETTINGS);
  return DEFAULT_SETTINGS;
}
