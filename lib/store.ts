"use client";

import type { MealType } from "./presets";
import { macrosFor, type Macros } from "./ingredients";

export type CustomMealItem = {
  custom: true;
  name: string;
  grams: number;
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
  sugar?: number;
  sodium?: number;
};
export type IngredientMealItem = { id: string; qty: number };
export type MealItem = IngredientMealItem | CustomMealItem;

export function isCustomItem(item: MealItem): item is CustomMealItem {
  return (item as CustomMealItem).custom === true;
}

export type MealLog = {
  id: string;
  date: string;
  mealType: MealType;
  items: MealItem[];
  loggedAt: number;
};

export type Per100g = {
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
  sugar?: number;
  sodium?: number;
};

export type CustomFood = {
  id: string;
  name: string;
  per100g: Per100g;
  createdAt: number;
};

export type DailyFlags = {
  date: string;
  gymDay: boolean;
  checklist: Record<string, boolean>;
};

const MEALS_KEY = "richie.meals.v1";
const DAILY_KEY = "richie.daily.v1";
const CUSTOM_KEY = "richie.customfoods.v1";
const OVERRIDES_KEY = "richie.ingredientoverrides.v1";
const MEALS_SYNCED_KEY = "richie.meals.synced.v1";

export type IngredientOverride = {
  name?: string;
  unit?: string;
  kcal?: number;
  protein?: number;
  fat?: number;
  carbs?: number;
  sugar?: number;
  sodium?: number;
};

function sumItemsMacros(items: MealItem[]): Macros {
  return items.reduce<Macros>(
    (acc, it) => {
      const m = isCustomItem(it)
        ? { kcal: it.kcal, protein: it.protein, fat: it.fat, carbs: it.carbs }
        : macrosFor(it.id, it.qty);
      return {
        kcal: acc.kcal + m.kcal,
        protein: acc.protein + m.protein,
        fat: acc.fat + m.fat,
        carbs: acc.carbs + m.carbs,
      };
    },
    { kcal: 0, protein: 0, fat: 0, carbs: 0 }
  );
}

function mealPayload(m: MealLog) {
  return {
    id: m.id,
    date: m.date,
    mealType: m.mealType,
    items: m.items,
    totals: sumItemsMacros(m.items),
  };
}

function postMeal(m: MealLog): void {
  if (typeof window === "undefined") return;
  fetch("/api/meals", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(mealPayload(m)),
    keepalive: true,
  }).catch(() => {});
}

function deleteMealRemote(id: string): void {
  if (typeof window === "undefined") return;
  fetch(`/api/meals?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
    keepalive: true,
  }).catch(() => {});
}

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function getAllMeals(): MealLog[] {
  return read<MealLog[]>(MEALS_KEY, []);
}

export function getMealsForDate(date: string): MealLog[] {
  return getAllMeals().filter((m) => m.date === date);
}

export function saveMeal(log: Omit<MealLog, "id" | "loggedAt">): MealLog {
  const all = getAllMeals();
  const existing = all.find((m) => m.date === log.date && m.mealType === log.mealType);
  if (existing) {
    existing.items = [...existing.items, ...log.items];
    existing.loggedAt = Date.now();
    write(MEALS_KEY, all);
    postMeal(existing);
    return existing;
  }
  const entry: MealLog = {
    ...log,
    id: crypto.randomUUID(),
    loggedAt: Date.now(),
  };
  all.push(entry);
  write(MEALS_KEY, all);
  postMeal(entry);
  return entry;
}

export function updateMealItems(id: string, items: MealItem[]): void {
  const all = getAllMeals();
  const idx = all.findIndex((m) => m.id === id);
  if (idx === -1) return;
  if (items.length === 0) {
    all.splice(idx, 1);
    write(MEALS_KEY, all);
    deleteMealRemote(id);
    return;
  }
  all[idx] = { ...all[idx], items, loggedAt: Date.now() };
  write(MEALS_KEY, all);
  postMeal(all[idx]);
}

export function deleteMeal(id: string): void {
  write(
    MEALS_KEY,
    getAllMeals().filter((m) => m.id !== id)
  );
  deleteMealRemote(id);
}

export async function syncMealsToDbOnce(): Promise<{ synced: number } | null> {
  if (typeof window === "undefined") return null;
  try {
    if (window.localStorage.getItem(MEALS_SYNCED_KEY) === "1") return null;
    const all = getAllMeals();
    if (all.length === 0) {
      window.localStorage.setItem(MEALS_SYNCED_KEY, "1");
      return { synced: 0 };
    }
    const payload = all.map(mealPayload);
    const res = await fetch("/api/meals/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { synced: number };
    window.localStorage.setItem(MEALS_SYNCED_KEY, "1");
    return { synced: data.synced };
  } catch {
    return null;
  }
}

export function clearMealsForDate(date: string): void {
  write(
    MEALS_KEY,
    getAllMeals().filter((m) => m.date !== date)
  );
}

/**
 * Collapses any pre-existing duplicate (date, mealType) rows into a single
 * row per day+type. Idempotent — safe to run on every app load to heal data
 * written before the merge-on-save fix.
 */
export function dedupeMeals(): number {
  const all = getAllMeals();
  const keyed = new Map<string, MealLog>();
  let dupes = 0;
  for (const m of all) {
    const k = `${m.date}|${m.mealType}`;
    const prev = keyed.get(k);
    if (!prev) {
      keyed.set(k, { ...m, items: [...m.items] });
      continue;
    }
    dupes++;
    prev.items.push(...m.items);
    if (m.loggedAt > prev.loggedAt) prev.loggedAt = m.loggedAt;
  }
  if (dupes === 0) return 0;
  write(MEALS_KEY, Array.from(keyed.values()));
  return dupes;
}

export function getLastMealOfType(mealType: MealType): MealLog | null {
  const all = getAllMeals().filter((m) => m.mealType === mealType);
  if (!all.length) return null;
  return all.sort((a, b) => b.loggedAt - a.loggedAt)[0];
}

/**
 * Default GYM/REST based on day of week:
 *   Wed (3) and Sun (0) = REST, all other days = GYM.
 * Richie trains 5x/week including Saturday.
 */
function defaultGymDay(date: string): boolean {
  const [y, m, d] = date.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return dow !== 0 && dow !== 3;
}

export function getDaily(date: string): DailyFlags {
  const all = read<Record<string, DailyFlags>>(DAILY_KEY, {});
  return all[date] ?? { date, gymDay: defaultGymDay(date), checklist: {} };
}

export function setDaily(flags: DailyFlags): void {
  const all = read<Record<string, DailyFlags>>(DAILY_KEY, {});
  all[flags.date] = flags;
  write(DAILY_KEY, all);
}

export function getCustomFoods(): CustomFood[] {
  return read<CustomFood[]>(CUSTOM_KEY, []);
}

export function saveCustomFood(name: string, per100g: Per100g): CustomFood {
  const entry: CustomFood = {
    id: crypto.randomUUID(),
    name,
    per100g,
    createdAt: Date.now(),
  };
  const all = getCustomFoods();
  all.push(entry);
  write(CUSTOM_KEY, all);
  return entry;
}

export function deleteCustomFood(id: string): void {
  write(
    CUSTOM_KEY,
    getCustomFoods().filter((f) => f.id !== id)
  );
}

export function updateCustomFood(id: string, name: string, per100g: Per100g): void {
  const all = getCustomFoods();
  const idx = all.findIndex((f) => f.id === id);
  if (idx === -1) return;
  all[idx] = { ...all[idx], name, per100g };
  write(CUSTOM_KEY, all);
}

export function getIngredientOverrides(): Record<string, IngredientOverride> {
  return read<Record<string, IngredientOverride>>(OVERRIDES_KEY, {});
}

export function saveIngredientOverride(id: string, patch: IngredientOverride): void {
  const all = getIngredientOverrides();
  all[id] = patch;
  write(OVERRIDES_KEY, all);
}

export function resetIngredientOverride(id: string): void {
  const all = getIngredientOverrides();
  delete all[id];
  write(OVERRIDES_KEY, all);
}

export function scaleByGrams(per100g: Per100g, grams: number): {
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
  sugar: number;
  sodium: number;
} {
  const f = grams / 100;
  return {
    kcal: per100g.kcal * f,
    protein: per100g.protein * f,
    fat: per100g.fat * f,
    carbs: per100g.carbs * f,
    sugar: (per100g.sugar ?? 0) * f,
    sodium: (per100g.sodium ?? 0) * f,
  };
}
