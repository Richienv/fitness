// Persisted per-user custom foods added through Tambah Cepat / ManualFoodSheet.
// Stored in user-scoped localStorage so newly created everyday foods stay
// immediately searchable on subsequent meals without waiting for catalogue reseed.
// Pure data module: NO "use client".

import { scopedKey } from "./userScope.ts";
import type { RecipeFood } from "./recipes.ts";

const CUSTOM_FOODS_KEY = "richie.customfoods.v1";
const MAX_SAVED_CUSTOM_FOODS = 200;

/** Estimate kcal from protein, fat, and carbs using standard Atwater factors. */
export function estimateKcalFromMacros(
  protein: number,
  fat: number,
  carbs: number,
): number {
  const p = Number.isFinite(protein) && protein > 0 ? protein : 0;
  const f = Number.isFinite(fat) && fat > 0 ? fat : 0;
  const c = Number.isFinite(carbs) && carbs > 0 ? carbs : 0;
  return Math.round(4 * p + 9 * f + 4 * c);
}

/** Read the user's saved custom foods (newest first). */
export function getSavedCustomFoods(): RecipeFood[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(scopedKey(CUSTOM_FOODS_KEY));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RecipeFood[]) : [];
  } catch {
    return [];
  }
}

/** Save or update a custom food by normalized name, keeping recent entries first. */
export function saveCustomFood(food: RecipeFood): RecipeFood[] {
  const existing = getSavedCustomFoods();
  const normName = food.name.trim().toLowerCase();
  const filtered = existing.filter(
    (item) => item.id !== food.id && item.name.trim().toLowerCase() !== normName,
  );
  const next = [food, ...filtered].slice(0, MAX_SAVED_CUSTOM_FOODS);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(scopedKey(CUSTOM_FOODS_KEY), JSON.stringify(next));
  }
  return next;
}
