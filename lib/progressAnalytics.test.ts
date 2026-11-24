import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDailyProgressRows,
  buildProgressProjection,
  type DailyProgressInput,
} from "./progressAnalytics.ts";

const profile = { sex: "male" as const, cm: 175, age: 25, fallbackKg: 76 };

test("buildDailyProgressRows computes normal burn, total burn, deficit, and newest-first order", () => {
  const days: DailyProgressInput[] = [
    {
      date: "2026-11-20",
      weightKg: 76.4,
      kcalIn: 1750,
      proteinG: 145,
      carbsG: 170,
      fatG: 50,
      mealCount: 3,
      activeBurnKcal: 260,
      activeFromHealth: false,
      workoutCount: 1,
      waterMl: 2000,
    },
    {
      date: "2026-11-21",
      weightKg: 76.1,
      kcalIn: 0,
      proteinG: 0,
      carbsG: 0,
      fatG: 0,
      mealCount: 0,
      activeBurnKcal: 0,
      activeFromHealth: false,
      workoutCount: 0,
      waterMl: 1250,
    },
  ];
  const rows = buildDailyProgressRows(days, profile);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].date, "2026-11-21");
  // Unlogged meal day keeps deficitKcal null instead of faking a 2000 kcal deficit.
  assert.equal(rows[0].deficitKcal, null);
  assert.equal(rows[0].waterMl, 1250);

  assert.equal(rows[1].date, "2026-11-20");
  assert.ok(rows[1].normalBurnKcal > 2000);
  assert.equal(rows[1].totalBurnKcal, rows[1].normalBurnKcal + 260);
  assert.equal(rows[1].deficitKcal, rows[1].totalBurnKcal - 1750);
  assert.equal(rows[1].proteinG, 145);
});

test("buildProgressProjection forecasts 14/30/60/90d weight and target date from recent logged pace", () => {
  const days: DailyProgressInput[] = [
    {
      date: "2026-11-18",
      weightKg: 77.0,
      kcalIn: 1800,
      proteinG: 140,
      carbsG: 180,
      fatG: 55,
      mealCount: 3,
      activeBurnKcal: 300,
      activeFromHealth: false,
      workoutCount: 1,
      waterMl: 2000,
    },
    {
      date: "2026-11-21",
      weightKg: 76.5,
      kcalIn: 1850,
      proteinG: 150,
      carbsG: 175,
      fatG: 55,
      mealCount: 3,
      activeBurnKcal: 250,
      activeFromHealth: false,
      workoutCount: 1,
      waterMl: 2200,
    },
    {
      date: "2026-11-23",
      weightKg: 76.1,
      kcalIn: 1750,
      proteinG: 148,
      carbsG: 165,
      fatG: 52,
      mealCount: 3,
      activeBurnKcal: 280,
      activeFromHealth: false,
      workoutCount: 1,
      waterMl: 1800,
    },
    // Partial morning today (should be excluded when >=2 completed days exist)
    {
      date: "2026-11-24",
      weightKg: 76.0,
      kcalIn: 300,
      proteinG: 25,
      carbsG: 30,
      fatG: 8,
      mealCount: 1,
      activeBurnKcal: 0,
      activeFromHealth: false,
      workoutCount: 0,
      waterMl: 500,
    },
  ];

  const rows = buildDailyProgressRows(days, profile);
  const proj = buildProgressProjection(rows, 76.0, 72.0, "2026-11-24")!;
  assert.equal(proj.sampleDays, 3); // excluded partial today!
  assert.equal(proj.trend, "losing");
  assert.ok(proj.avgDeficitKcal > 400);
  assert.ok(proj.weeklyKgChange < -0.3);
  assert.ok(proj.projected30d < proj.projected14d && proj.projected14d < 76.0);
  assert.ok(proj.projected60d < proj.projected30d);
  assert.ok(proj.daysToTarget !== null && proj.daysToTarget > 0);
  assert.ok(proj.targetDate !== null && proj.targetDate > "2026-11-24");
  assert.ok(proj.observedWeeklyKgChange !== null && proj.observedWeeklyKgChange < 0);
});
