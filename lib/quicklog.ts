// User-configurable Quick Log entries — local-first, per-user via scopedKey.
// Pure data module: NO "use client" (mirrors lib/sleep.ts conventions so
// server routes may import it without tripping the build guard).

import { sumMacros } from "./ingredients";
import { PRESETS, type MealType } from "./presets";
import { scopedKey } from "./userScope";

export type QuickLogEntry = {
  id: string;
  label: string;
  mealType: MealType;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  sugar?: number;
  // Portion (grams) the stored macros correspond to. Optional + backward-
  // compatible: entries without it are fixed macros (no portion scaling).
  baseGrams?: number;
};

const QUICKLOG_ENTRIES_KEY = "richie.quicklog.entries.v1";
const MAX_ENTRIES = 8;

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(scopedKey(key));
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(scopedKey(key), JSON.stringify(value));
}

/** Strip a leading emoji/symbol prefix from a preset label. */
function cleanLabel(label: string): string {
  return label.replace(/^[^\p{L}\p{N}]+/u, "").trim();
}

/** Seed list: the first PRESET per meal type mapped to a QuickLogEntry. */
export function defaultEntries(): QuickLogEntry[] {
  const out: QuickLogEntry[] = [];
  for (const mealType of ["breakfast", "lunch", "snack", "dinner"] as const) {
    const preset = PRESETS.find((p) => p.mealType === mealType);
    if (!preset) continue;
    const m = sumMacros(preset.items);
    out.push({
      id: "seed-" + preset.id,
      label: cleanLabel(preset.label),
      mealType,
      kcal: Math.round(m.kcal),
      protein: Math.round(m.protein),
      carbs: Math.round(m.carbs),
      fat: Math.round(m.fat),
    });
  }
  return out;
}

export function getQuickLogEntries(): QuickLogEntry[] {
  const stored = read<QuickLogEntry[]>(QUICKLOG_ENTRIES_KEY, []);
  if (Array.isArray(stored) && stored.length > 0) return stored;
  return defaultEntries();
}

export function setQuickLogEntries(list: QuickLogEntry[]): QuickLogEntry[] {
  const next = list.slice(0, MAX_ENTRIES);
  write(QUICKLOG_ENTRIES_KEY, next);
  return next;
}

export function addQuickLogEntry(e: Omit<QuickLogEntry, "id">): QuickLogEntry[] {
  const current = getQuickLogEntries();
  const entry: QuickLogEntry = { ...e, id: "ql-" + crypto.randomUUID() };
  return setQuickLogEntries([...current, entry]);
}

export function updateQuickLogEntry(
  id: string,
  patch: Partial<QuickLogEntry>
): QuickLogEntry[] {
  const current = getQuickLogEntries();
  const next = current.map((e) =>
    e.id === id ? { ...e, ...patch, id: e.id } : e
  );
  return setQuickLogEntries(next);
}

export function deleteQuickLogEntry(id: string): QuickLogEntry[] {
  const current = getQuickLogEntries();
  return setQuickLogEntries(current.filter((e) => e.id !== id));
}

export function moveQuickLogEntry(id: string, dir: -1 | 1): QuickLogEntry[] {
  const current = getQuickLogEntries();
  const idx = current.findIndex((e) => e.id === id);
  if (idx === -1) return current;
  const swap = idx + dir;
  if (swap < 0 || swap >= current.length) return current;
  const next = [...current];
  [next[idx], next[swap]] = [next[swap], next[idx]];
  return setQuickLogEntries(next);
}
