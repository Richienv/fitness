// Saved meal templates — "Sarapan biasa", "Makan siang kantor".
//
// Most people eat the same handful of meals on repeat, so re-searching every
// item each morning is the biggest avoidable cost in food logging. A template
// snapshots a whole tray and replays it in one tap.
//
// Local-first, per-user via scopedKey, mirroring lib/foodGroups.ts and
// lib/foodPicks.ts. Each item carries its own macro snapshot so a template
// renders and logs WITHOUT hitting the food search — it keeps working offline
// and survives a food being renamed or re-ranked in the shared catalogue.

import { scopedKey } from "./userScope";

export type TemplateItem = {
  id: string;
  name: string;
  /** Quantity in `gramsPerUnit` units — the same unit the builder's tray uses. */
  qty: number;
  unit: string;
  gramsPerUnit?: number;
  step?: number;
  /** Per-unit macros; multiply by qty for the serving. */
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
};

export type MealTemplate = {
  id: string;
  name: string;
  emoji: string;
  items: TemplateItem[];
  createdAt: number;
  /** Set on each use so the list can rank most-recently-used first. */
  lastUsedAt?: number;
  useCount?: number;
};

const KEY = "richie.mealTemplates.v1";

function read(): MealTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(scopedKey(KEY));
    const list = raw ? (JSON.parse(raw) as MealTemplate[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function write(list: MealTemplate[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(scopedKey(KEY), JSON.stringify(list));
  } catch {
    /* ignore quota */
  }
}

/** Most-recently-used first, then newest. */
export function getMealTemplates(): MealTemplate[] {
  return read().sort(
    (a, b) => (b.lastUsedAt ?? b.createdAt) - (a.lastUsedAt ?? a.createdAt)
  );
}

export function saveMealTemplate(
  name: string,
  emoji: string,
  items: TemplateItem[]
): MealTemplate {
  const list = read();
  const entry: MealTemplate = {
    id: crypto.randomUUID(),
    name: name.trim().slice(0, 40) || "Menu saya",
    emoji: emoji || "🍽️",
    items,
    createdAt: Date.now(),
  };
  list.push(entry);
  write(list);
  return entry;
}

export function deleteMealTemplate(id: string): void {
  write(read().filter((t) => t.id !== id));
}

/** Record a use so the template floats to the top next time. */
export function markTemplateUsed(id: string): void {
  const list = read();
  const t = list.find((x) => x.id === id);
  if (!t) return;
  t.lastUsedAt = Date.now();
  t.useCount = (t.useCount ?? 0) + 1;
  write(list);
}

/** Total calories of a template, for the card subtitle. */
export function templateKcal(t: MealTemplate): number {
  return Math.round(t.items.reduce((a, i) => a + i.kcal * i.qty, 0));
}
