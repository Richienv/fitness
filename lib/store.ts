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

export type TLvlInputs = {
  sleepHours?: number;   // 0–12
  stressLevel?: number;  // 0–10
  alcohol?: boolean;
  cardioMin?: number;
};

export type DailyFlags = {
  date: string;
  gymDay: boolean;
  checklist: Record<string, boolean>;
  tlvl?: TLvlInputs;
};

const MEALS_KEY = "richie.meals.v1";
const DAILY_KEY = "richie.daily.v1";
const CUSTOM_KEY = "richie.customfoods.v1";
const OVERRIDES_KEY = "richie.ingredientoverrides.v1";
const MEALS_SYNCED_KEY = "richie.meals.synced.v1";
const FOODS_SYNCED_KEY = "richie.customfoods.synced.v1";
const QUICKLOG_KEY = "richie.quicklog.v1";
// Server rows already imported into localStorage. Needed because
// dedupeMeals() collapses rows and loses their original ids — without this
// set every sync would re-import the same Hermes meal forever.
const SEEN_MEALS_KEY = "richie.server.seenMeals.v1";
const SEEN_FOODS_KEY = "richie.server.seenFoods.v1";

export const QUICKLOG_MAX = 4;

/** Preset IDs to surface on the meal-home Quick Log grid. Empty array
 * means "no override" — the caller should fall back to defaults. */
export function getQuickLogIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(QUICKLOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((x): x is string => typeof x === "string");
  } catch {}
  return [];
}

export function setQuickLogIds(ids: string[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(QUICKLOG_KEY, JSON.stringify(ids.slice(0, QUICKLOG_MAX)));
}

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

// ---------- Server → local pull sync (Hermes-logged data) ----------

type ServerMealRow = {
  id: string;
  date: string;
  mealType: string;
  items: unknown;
  totals: unknown;
  createdAt?: string;
};

function getSeenSet(key: string): Set<string> {
  return new Set(read<string[]>(key, []));
}

function addSeen(key: string, ids: string[]): void {
  if (ids.length === 0) return;
  const seen = getSeenSet(key);
  for (const id of ids) seen.add(id);
  write(key, Array.from(seen));
}

/** Server items written by older Hermes builds lack the MealItem shape —
 * coerce anything with a name+kcal into a CustomMealItem the UI can render. */
function coerceServerItems(raw: unknown): MealItem[] {
  if (!Array.isArray(raw)) return [];
  const out: MealItem[] = [];
  for (const it of raw) {
    if (!it || typeof it !== "object") continue;
    const o = it as Record<string, unknown>;
    if (o.custom === true && typeof o.name === "string") {
      out.push({
        custom: true,
        name: o.name,
        grams: typeof o.grams === "number" ? o.grams : 100,
        kcal: typeof o.kcal === "number" ? o.kcal : 0,
        protein: typeof o.protein === "number" ? o.protein : 0,
        fat: typeof o.fat === "number" ? o.fat : 0,
        carbs: typeof o.carbs === "number" ? o.carbs : 0,
      });
    } else if (typeof o.id === "string" && typeof o.qty === "number") {
      out.push({ id: o.id, qty: o.qty });
    } else if (typeof o.name === "string" && typeof o.kcal === "number") {
      out.push({
        custom: true,
        name: o.name,
        grams: 100,
        kcal: o.kcal,
        protein: typeof o.protein === "number" ? o.protein : 0,
        fat: typeof o.fat === "number" ? o.fat : 0,
        carbs: typeof o.carbs === "number" ? o.carbs : 0,
      });
    }
  }
  return out;
}

/** Import server meal rows not seen before. Returns number imported. */
export function mergeServerMeals(rows: ServerMealRow[]): number {
  if (typeof window === "undefined") return 0;
  const seen = getSeenSet(SEEN_MEALS_KEY);
  const all = getAllMeals();
  const localIds = new Set(all.map((m) => m.id));
  // Everything already local was either created here or imported earlier.
  addSeen(SEEN_MEALS_KEY, all.map((m) => m.id));

  const importedIds: string[] = [];
  let added = 0;
  for (const row of rows) {
    if (seen.has(row.id) || localIds.has(row.id)) continue;
    const items = coerceServerItems(row.items);
    importedIds.push(row.id);
    if (items.length === 0) continue;
    const existing = all.find(
      (m) => m.date === row.date && m.mealType === row.mealType
    );
    if (existing) {
      existing.items = [...existing.items, ...items];
      existing.loggedAt = Date.now();
    } else {
      all.push({
        id: row.id,
        date: row.date,
        mealType: row.mealType as MealType,
        items,
        loggedAt: row.createdAt ? Date.parse(row.createdAt) : Date.now(),
      });
    }
    added++;
  }
  if (added > 0) write(MEALS_KEY, all);
  addSeen(SEEN_MEALS_KEY, importedIds);
  return added;
}

type ServerFoodRow = {
  id: string;
  name: string;
  per100g: unknown;
  createdAt?: string;
};

/** Import shared-library foods not seen before. Returns number imported. */
export function mergeServerFoods(rows: ServerFoodRow[]): number {
  if (typeof window === "undefined") return 0;
  const seen = getSeenSet(SEEN_FOODS_KEY);
  const all = getCustomFoods();
  const localIds = new Set(all.map((f) => f.id));
  const localNames = new Set(all.map((f) => f.name.trim().toLowerCase()));
  addSeen(SEEN_FOODS_KEY, all.map((f) => f.id));

  const importedIds: string[] = [];
  let added = 0;
  for (const row of rows) {
    if (seen.has(row.id) || localIds.has(row.id)) continue;
    importedIds.push(row.id);
    const p = (row.per100g ?? {}) as Partial<Per100g>;
    if (typeof p.kcal !== "number") continue;
    if (localNames.has(row.name.trim().toLowerCase())) continue;
    all.push({
      id: row.id,
      name: row.name,
      per100g: {
        kcal: p.kcal,
        protein: p.protein ?? 0,
        fat: p.fat ?? 0,
        carbs: p.carbs ?? 0,
        sugar: p.sugar,
        sodium: p.sodium,
      },
      createdAt: row.createdAt ? Date.parse(row.createdAt) : Date.now(),
    });
    added++;
  }
  if (added > 0) write(CUSTOM_KEY, all);
  addSeen(SEEN_FOODS_KEY, importedIds);
  return added;
}

/** One-shot push of pre-existing local custom foods into the shared library. */
export async function syncCustomFoodsToDbOnce(): Promise<{ synced: number } | null> {
  if (typeof window === "undefined") return null;
  try {
    if (window.localStorage.getItem(FOODS_SYNCED_KEY) === "1") return null;
    const all = getCustomFoods();
    let synced = 0;
    for (const f of all) {
      const res = await fetch("/api/foods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: f.id, name: f.name, per100g: f.per100g }),
      });
      if (res.ok) synced++;
    }
    window.localStorage.setItem(FOODS_SYNCED_KEY, "1");
    return { synced };
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

function postFoodRemote(f: CustomFood): void {
  if (typeof window === "undefined") return;
  fetch("/api/foods", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: f.id, name: f.name, per100g: f.per100g }),
    keepalive: true,
  }).catch(() => {});
}

function deleteFoodRemote(id: string): void {
  if (typeof window === "undefined") return;
  fetch(`/api/foods?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
    keepalive: true,
  }).catch(() => {});
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
  postFoodRemote(entry);
  return entry;
}

export function deleteCustomFood(id: string): void {
  write(
    CUSTOM_KEY,
    getCustomFoods().filter((f) => f.id !== id)
  );
  deleteFoodRemote(id);
}

export function updateCustomFood(id: string, name: string, per100g: Per100g): void {
  const all = getCustomFoods();
  const idx = all.findIndex((f) => f.id === id);
  if (idx === -1) return;
  all[idx] = { ...all[idx], name, per100g };
  write(CUSTOM_KEY, all);
  postFoodRemote(all[idx]);
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
