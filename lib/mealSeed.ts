"use client";

import { saveMeal, getMealsForDate, type CustomMealItem, type MealItem } from "./store";
import type { MealType } from "./presets";

type SeedMeal = { date: string; mealType: MealType; items: MealItem[] };

const SEED_FLAG_KEY = "richie.mealSeed.apr13.v1";

const APR13_MEALS: SeedMeal[] = [
  {
    date: "2026-04-13",
    mealType: "lunch",
    items: [
      { id: "spicy-beef-noodle", qty: 1 },
      { id: "clear-beef-noodle", qty: 1 },
      {
        custom: true,
        name: "Fried chicken bites",
        grams: 100,
        kcal: 220,
        protein: 11,
        fat: 14,
        carbs: 18,
      } satisfies CustomMealItem,
    ],
  },
  {
    date: "2026-04-13",
    mealType: "dinner",
    items: [
      { id: "chicken-thigh", qty: 1 },
      { id: "egg", qty: 3 },
      { id: "banana", qty: 1 },
    ],
  },
  {
    date: "2026-04-13",
    mealType: "snack",
    items: [{ id: "whey", qty: 1 }],
  },
];

export function seedApr13Meals(): { seeded: number } | null {
  if (typeof window === "undefined") return null;
  try {
    if (window.localStorage.getItem(SEED_FLAG_KEY) === "1") return null;

    let seeded = 0;
    for (const m of APR13_MEALS) {
      const existing = getMealsForDate(m.date).find((x) => x.mealType === m.mealType);
      if (existing) continue;
      saveMeal({ date: m.date, mealType: m.mealType, items: m.items });
      seeded++;
    }
    window.localStorage.setItem(SEED_FLAG_KEY, "1");
    return { seeded };
  } catch {
    return null;
  }
}
