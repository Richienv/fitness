import test from "node:test";
import assert from "node:assert/strict";
import { reconcileServerMeals, type ServerMealRow } from "./mealRecords.ts";
import type { MealLog } from "./store.ts";

test("reconcileServerMeals imports new meals, applies edits from another device, and prunes remote deletions only when fromDate is set", () => {
  const seen = new Set<string>();
  let localMeals: MealLog[] = [];
  let sigs: Record<string, string> = {};

  const baseItem = {
    custom: true as const,
    name: "Telur rebus",
    grams: 100,
    kcal: 155,
    protein: 13,
    carbs: 1,
    fat: 11,
    addedAt: 1000,
  };

  const row1: ServerMealRow = {
    id: "meal-a",
    date: "2026-11-26",
    mealType: "breakfast",
    items: [baseItem],
    totals: { kcal: 155, protein: 13, fat: 11, carbs: 1 },
    createdAt: "2026-11-26T01:00:00.000Z",
    photoUrl: null,
  };

  // 1. First sync imports meal-a
  const r1 = reconcileServerMeals(localMeals, seen, sigs, [row1]);
  assert.equal(r1.changed, 1);
  assert.equal(r1.meals.length, 1);
  localMeals = r1.meals;
  sigs = r1.sigs;
  for (const id of r1.importedIds) seen.add(id);

  // 2. Another device adds Pisang to meal-a
  const row1Edited: ServerMealRow = {
    ...row1,
    items: [
      baseItem,
      {
        custom: true,
        name: "Pisang",
        grams: 120,
        kcal: 105,
        protein: 1.3,
        carbs: 27,
        fat: 0.4,
        addedAt: 2000,
      },
    ],
  };
  const r2 = reconcileServerMeals(localMeals, seen, sigs, [row1Edited]);
  assert.equal(r2.changed, 1);
  assert.equal(r2.meals[0].items.length, 2);
  localMeals = r2.meals;
  sigs = r2.sigs;

  // 3. Partial merge (no fromDate) does NOT delete existing synced rows
  const r3 = reconcileServerMeals(localMeals, seen, sigs, []);
  assert.equal(r3.changed, 0);
  assert.equal(r3.meals.length, 1);

  // 4. Authoritative window merge (with fromDate) removes previously synced meal deleted remotely
  const r4 = reconcileServerMeals(localMeals, seen, sigs, [], {
    fromDate: "2026-11-20",
  });
  assert.equal(r4.changed, 1);
  assert.equal(r4.meals.length, 0);
});
