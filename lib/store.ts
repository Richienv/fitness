"use client";

import type { MealType } from "./presets";

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
  const entry: MealLog = {
    ...log,
    id: crypto.randomUUID(),
    loggedAt: Date.now(),
  };
  const all = getAllMeals();
  all.push(entry);
  write(MEALS_KEY, all);
  return entry;
}

export function deleteMeal(id: string): void {
  write(
    MEALS_KEY,
    getAllMeals().filter((m) => m.id !== id)
  );
}

export function getLastMealOfType(mealType: MealType): MealLog | null {
  const all = getAllMeals().filter((m) => m.mealType === mealType);
  if (!all.length) return null;
  return all.sort((a, b) => b.loggedAt - a.loggedAt)[0];
}

export function getDaily(date: string): DailyFlags {
  const all = read<Record<string, DailyFlags>>(DAILY_KEY, {});
  return all[date] ?? { date, gymDay: false, checklist: {} };
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
