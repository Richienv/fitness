import test from "node:test";
import assert from "node:assert/strict";
import { makeScorer, type AffinityStore } from "./foodAffinity.ts";
import { usualMeal } from "./usualMeal.ts";
import {
  comboNodeId,
  createHabitGraph,
  recordMealEvent,
  scoreMealRecommendations,
  type HabitFoodSnapshot,
} from "./habitGraph.ts";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 26, 12, 0, 0);

test("foodAffinity prioritizes food eaten yesterday over stale distant logs", () => {
  const store: AffinityStore = {
    foods: {
      // Eaten 5 times 25 days ago, then stopped
      "old-habit": { nf: 5, ns: 5, sl: [0, 5, 0, 0], last: NOW - 25 * DAY },
      // Eaten 3 times, most recently yesterday
      "yesterday-pick": { nf: 3, ns: 3, sl: [0, 3, 0, 0], last: NOW - 1 * DAY },
    },
    pairs: {},
  };
  const score = makeScorer(store, { now: NOW, slot: 1 });
  assert.ok(
    score("yesterday-pick") > score("old-habit"),
    `yesterday (${score("yesterday-pick")}) should beat 25d-old (${score("old-habit")})`,
  );
});

test("recencyWeighted usualMeal picks yesterday's recent habit over 12-day-old habit", () => {
  type Item = { key: string };
  const key = (i: Item) => i.key;
  const TODAY = "2026-11-26";
  const meals = [
    // Old meal eaten 2 days, 12-13 days ago
    { date: "2026-11-13", mealType: "lunch" as const, items: [{ key: "old-nasi" }] },
    { date: "2026-11-14", mealType: "lunch" as const, items: [{ key: "old-nasi" }] },
    // Recent meal eaten yesterday and 2 days ago
    { date: "2026-11-24", mealType: "lunch" as const, items: [{ key: "fresh-ayam" }] },
    { date: "2026-11-25", mealType: "lunch" as const, items: [{ key: "fresh-ayam" }] },
  ];
  const u = usualMeal(meals, "lunch", TODAY, key, {
    windowDays: 14,
    minDays: 2,
    recencyWeighted: true,
  });
  assert.ok(u);
  assert.equal(u.items[0].key, "fresh-ayam");
});

test("habitGraph prioritizes yesterday's meal combo over older equal-count combo", () => {
  const g = createHabitGraph("richie", NOW - 25 * DAY);
  const oldFood: HabitFoodSnapshot = {
    foodKey: "old-soto",
    name: "Soto Ayam",
    grams: 300,
    kcal: 360,
    protein: 24,
    carbs: 32,
    fat: 14,
  };
  const recentFood: HabitFoodSnapshot = {
    foodKey: "fresh-salmon",
    name: "Salmon Teriyaki",
    grams: 220,
    kcal: 420,
    protein: 38,
    carbs: 28,
    fat: 16,
  };

  for (let i = 0; i < 3; i++) {
    recordMealEvent(g, {
      eventId: `old-${i}`,
      date: `2026-11-0${5 + i}`,
      mealType: "lunch",
      at: NOW - (18 - i) * DAY,
      hour: 12,
      dayType: "gym",
      items: [oldFood],
    });
  }
  for (let i = 0; i < 2; i++) {
    recordMealEvent(g, {
      eventId: `fresh-${i}`,
      date: `2026-11-2${4 + i}`,
      mealType: "lunch",
      at: NOW - (2 - i) * DAY,
      hour: 12,
      dayType: "gym",
      items: [recentFood],
    });
  }

  const recs = scoreMealRecommendations(g, {
    now: NOW,
    hour: 12,
    mealSlot: "lunch",
    dayType: "gym",
    remainingKcal: 1200,
    remainingProtein: 90,
    kcalTarget: 2000,
    proteinTarget: 150,
    limit: 3,
  });

  assert.ok(recs.length >= 2);
  assert.equal(recs[0].targetNodeId, comboNodeId("lunch", [recentFood]));
});
