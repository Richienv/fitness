"use client";

import { useEffect } from "react";
import { syncMealsToDbOnce } from "@/lib/store";
import { seedApr13Meals } from "@/lib/mealSeed";

export default function MealSync() {
  useEffect(() => {
    const seed = seedApr13Meals();
    if (seed && seed.seeded > 0) console.log("[MealSync] seeded", seed.seeded, "APR 13 meals");
    syncMealsToDbOnce().then((res) => {
      if (res) console.log("[MealSync] synced", res.synced, "meals to DB");
    });
  }, []);
  return null;
}
