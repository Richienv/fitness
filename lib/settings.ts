"use client";

export type MacroTarget = { kcal: number; protein: number; carbs: number; fat: number };

export type UserSettings = {
  targets: { gymDay: MacroTarget; restDay: MacroTarget };
  startDate: string; // YYYY-MM-DD, week 1 of the 12-week block
};

export const DEFAULT_SETTINGS: UserSettings = {
  targets: {
    gymDay: { kcal: 2200, protein: 155, carbs: 150, fat: 70 },
    restDay: { kcal: 1700, protein: 155, carbs: 120, fat: 70 },
  },
  startDate: "2026-04-07",
};

const SETTINGS_KEY = "richie.settings.v1";

function read(): UserSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<UserSettings>;
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
