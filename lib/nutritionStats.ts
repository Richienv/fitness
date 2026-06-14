"use client";

import { getIngredient, macrosFor } from "./ingredients";
import { microsFor } from "./micronutrients";
import { isCustomItem, type MealItem, type MealLog } from "./store";

/** Full per-day nutrient picture: macros + extended micros + earned tags. */
export type FullNutrition = {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
  na: number;
  k: number;
  mg: number;
  fe: number;
  zn: number;
  ca: number;
  omega3: number;
  tags: string[];
};

export const ZERO_NUTRITION: FullNutrition = {
  kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0,
  na: 0, k: 0, mg: 0, fe: 0, zn: 0, ca: 0, omega3: 0, tags: [],
};

function add(a: FullNutrition, b: FullNutrition): FullNutrition {
  return {
    kcal: a.kcal + b.kcal,
    protein: a.protein + b.protein,
    carbs: a.carbs + b.carbs,
    fat: a.fat + b.fat,
    fiber: a.fiber + b.fiber,
    sugar: a.sugar + b.sugar,
    na: a.na + b.na,
    k: a.k + b.k,
    mg: a.mg + b.mg,
    fe: a.fe + b.fe,
    zn: a.zn + b.zn,
    ca: a.ca + b.ca,
    omega3: a.omega3 + b.omega3,
    tags: a.tags, // merged at the end via Set
  };
}

/** Custom meal items may carry their own micro fields (set by Hermes when it
 * logs a food it estimated). Library items pull from MICROS by id. */
type CustomMicroCarrier = {
  na?: number; k?: number; mg?: number; fe?: number; zn?: number;
  ca?: number; fiber?: number; omega3?: number; tags?: string[];
};

function itemNutrition(it: MealItem): FullNutrition {
  if (isCustomItem(it)) {
    const c = it as MealItem & CustomMicroCarrier;
    return {
      kcal: it.kcal,
      protein: it.protein,
      carbs: it.carbs,
      fat: it.fat,
      fiber: c.fiber ?? 0,
      sugar: it.sugar ?? 0,
      na: c.na ?? it.sodium ?? 0,
      k: c.k ?? 0,
      mg: c.mg ?? 0,
      fe: c.fe ?? 0,
      zn: c.zn ?? 0,
      ca: c.ca ?? 0,
      omega3: c.omega3 ?? 0,
      tags: Array.isArray(c.tags) ? c.tags : [],
    };
  }
  const m = macrosFor(it.id, it.qty);
  const ing = getIngredient(it.id);
  const mi = microsFor(it.id, it.qty);
  return {
    kcal: m.kcal,
    protein: m.protein,
    carbs: m.carbs,
    fat: m.fat,
    fiber: mi.fiber,
    sugar: (ing?.sugar ?? 0) * it.qty,
    na: mi.na || (ing?.sodium ?? 0) * it.qty,
    k: mi.k,
    mg: mi.mg,
    fe: mi.fe,
    zn: mi.zn,
    ca: mi.ca,
    omega3: mi.omega3,
    tags: mi.tags,
  };
}

/** Aggregate full nutrition across any set of meals. Tags are de-duplicated
 * and only counted from items actually present (qty > 0). */
export function sumNutrition(meals: MealLog[]): FullNutrition {
  let acc: FullNutrition = { ...ZERO_NUTRITION };
  const tagSet = new Set<string>();
  for (const meal of meals) {
    for (const it of meal.items) {
      const n = itemNutrition(it);
      acc = add(acc, n);
      for (const t of n.tags) tagSet.add(t);
    }
  }
  acc.tags = Array.from(tagSet);
  return acc;
}
