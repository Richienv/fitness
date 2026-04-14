"use client";

import { useEffect } from "react";
import { syncMealsToDbOnce } from "@/lib/store";

export default function MealSync() {
  useEffect(() => {
    syncMealsToDbOnce().then((res) => {
      if (res) console.log("[MealSync] synced", res.synced, "meals to DB");
    });
  }, []);
  return null;
}
