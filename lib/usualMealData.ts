"use client";
// Browser side of "Makan biasa": reads the usual meal from stored meals, logs
// it with one stamp, and can take exactly that log back. Uses the existing
// saveMeal/updateMealItems, so storage shapes and sync stay as they are.
import {
  getAllMeals,
  isCustomItem,
  saveMeal,
  updateMealItems,
  type MealItem,
} from "./store";
import { getIngredient, macrosFor } from "./ingredients";
import { foodLabel } from "./foodLabel";
import type { MealType } from "./presets";
import { usualMeal } from "./usualMeal";

export type UsualOffer = {
  slot: MealType;
  items: MealItem[];
  /** "Oat + whey" or "Nasi + 2 lainnya". */
  label: string;
  kcal: number;
  protein: number;
  /** Days he ate it in the last 4 weeks. */
  days: number;
};

const itemKey = (i: MealItem) =>
  isCustomItem(i) ? `c:${i.name.trim().toLowerCase()}` : `i:${i.id}`;

function itemName(i: MealItem): string {
  if (isCustomItem(i)) return i.name;
  const ing = getIngredient(i.id);
  return ing ? foodLabel(ing) : i.id;
}

export function readUsualMeal(slot: MealType, today: string): UsualOffer | null {
  const u = usualMeal(getAllMeals(), slot, today, itemKey);
  if (!u) return null;
  let kcal = 0,
    protein = 0;
  for (const i of u.items) {
    const n = isCustomItem(i) ? i : macrosFor(i.id, i.qty);
    kcal += Number(n.kcal) || 0;
    protein += Number(n.protein) || 0;
  }
  const names = [...new Set(u.items.map(itemName))];
  const label =
    names.length <= 2
      ? names.join(" + ")
      : `${names[0]} + ${names.length - 1} lainnya`;
  return { slot, items: u.items, label, kcal, protein, days: u.days };
}

/** Logs the usual meal for `date`. Every item gets the same fresh stamp, which
 *  is what lets undo remove exactly this log and nothing else. */
export function logUsualMeal(
  offer: UsualOffer,
  date: string,
): { mealId: string; stamp: number } {
  const items = offer.items.map((i) => {
    const copy = { ...i };
    delete copy.addedAt;
    return copy;
  });
  const entry = saveMeal({ date, mealType: offer.slot, items });
  return { mealId: entry.id, stamp: entry.loggedAt };
}

export function undoUsualMeal(mealId: string, stamp: number): void {
  const meal = getAllMeals().find((m) => m.id === mealId);
  if (!meal) return;
  updateMealItems(
    meal.id,
    meal.items.filter((i) => i.addedAt !== stamp),
  );
}
