"use client";

// Bridges the app's stored meals to the engine's HistoryMeal shape, and
// memoizes the result.
//
// The memo is the point: suggest() has a 16 ms budget and runs on every tray
// change, while buildHistory() walks the whole log. Building it once per
// session and invalidating on save keeps the hot path clean.

import { getAllMeals, isCustomItem, type MealLog } from "../store.ts";
import { getIngredient } from "../ingredients.ts";
import { todayKey } from "../targets.ts";
import { buildHistory, type HistoryMeal } from "./history.ts";
import { emptyHistory, type Category, type HistoryStats, type MealType } from "./types.ts";

/** Map a food's group/foodGroup onto the engine's five buckets. */
const GROUP_TO_CATEGORY: Record<string, Category> = {
  protein: "protein",
  carb: "carb",
  vegetable: "vegetable",
  extra: "extra",
  drink: "drink",
  custom: "extra",
  Serealia: "carb",
  Umbi: "carb",
  Sayur: "vegetable",
  Buah: "vegetable",
  Gula: "extra",
  Lemak: "extra",
  Bumbu: "extra",
  Susu: "drink",
  Minuman: "drink",
  "Kue/Dessert": "extra",
  "Masakan Nusantara": "protein",
  "Custom/Estimasi": "protein",
};

export function categoryForGroup(group: string | undefined | null): Category {
  return (group && GROUP_TO_CATEGORY[group]) || "extra";
}

/** One logged meal in the engine's shape. Custom (typed) items have no stable
 *  id to learn from, so they're keyed by their own name — two "Nasi padang"
 *  entries a week apart should still count as the same food. */
function toHistoryMeal(m: MealLog): HistoryMeal {
  const foods = m.items.map((it) => {
    if (isCustomItem(it)) {
      return {
        foodId: `custom:${it.name.trim().toLowerCase()}`,
        category: "extra" as Category,
        grams: it.grams || 0,
      };
    }
    const ing = getIngredient(it.id);
    return {
      foodId: it.id,
      category: categoryForGroup(ing?.group),
      grams: (ing?.gramsPerUnit ?? 100) * it.qty,
    };
  });
  return { date: m.date, mealType: m.mealType as MealType, foods };
}

let cache: { key: string; stats: HistoryStats } | null = null;

/** Stats for the current user's history, memoized until invalidated. */
export function getHistoryStats(): HistoryStats {
  if (typeof window === "undefined") return emptyHistory();
  const today = todayKey();
  const meals = getAllMeals();
  // Cheap invalidation key: a new day or a changed meal count both mean the
  // stats are stale. Explicit invalidation on save covers edits in place.
  const key = `${today}|${meals.length}`;
  if (cache && cache.key === key) return cache.stats;
  const stats = buildHistory(meals.map(toHistoryMeal), today);
  cache = { key, stats };
  return stats;
}

/** Call after saving or editing a meal. */
export function invalidateHistoryStats(): void {
  cache = null;
}
