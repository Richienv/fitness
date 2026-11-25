import test from "node:test";
import assert from "node:assert/strict";
import {
  bucketProgressRows,
  buildDailyProgressRows,
  buildProgressProjection,
  computeMetricStats,
  niceTicks,
  weightTrend7d,
  type DailyProgressInput,
} from "./progressAnalytics.ts";

const profile = { sex: "male" as const, cm: 175, age: 25, fallbackKg: 76 };

function makeDay(
  date: string,
  overrides: Partial<DailyProgressInput> = {},
): DailyProgressInput {
  return {
    date,
    weightKg: null,
    kcalIn: 1800,
    proteinG: 150,
    carbsG: 170,
    fatG: 55,
    mealCount: 3,
    activeBurnKcal: 250,
    activeFromHealth: false,
    workoutCount: 1,
    waterMl: 2000,
    ...overrides,
  };
}

test("buildDailyProgressRows computes normal burn, total burn, deficit, sugar/fiber/sodium defaults, and newest-first order", () => {
  const days: DailyProgressInput[] = [
    {
      date: "2026-11-20",
      weightKg: 76.4,
      kcalIn: 1750,
      proteinG: 145,
      carbsG: 170,
      fatG: 50,
      sugarG: 18.44,
      fiberG: 26.2,
      sodiumMg: 1920,
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
      // omitted optional sugarG, fiberG, sodiumMg must default cleanly to 0
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
  assert.equal(rows[0].sugarG, 0);
  assert.equal(rows[0].fiberG, 0);
  assert.equal(rows[0].sodiumMg, 0);

  assert.equal(rows[1].date, "2026-11-20");
  assert.ok(rows[1].normalBurnKcal > 2000);
  assert.equal(rows[1].totalBurnKcal, rows[1].normalBurnKcal + 260);
  assert.equal(rows[1].deficitKcal, rows[1].totalBurnKcal - 1750);
  assert.equal(rows[1].proteinG, 145);
  assert.equal(rows[1].sugarG, 18.4);
  assert.equal(rows[1].fiberG, 26.2);
  assert.equal(rows[1].sodiumMg, 1920);
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

test("weightTrend7d computes trailing 7-calendar-day moving average and drops stale gaps", () => {
  const days: DailyProgressInput[] = [
    makeDay("2026-11-01", { weightKg: 78.0 }),
    makeDay("2026-11-03", { weightKg: 77.6 }),
    makeDay("2026-11-04", { weightKg: null }),
    makeDay("2026-11-08", { weightKg: 77.0 }), // Nov 1 falls out of 7d window (Nov 2..8)
    makeDay("2026-11-20", { weightKg: null }), // 12d after last weigh-in -> trend null
  ];
  const rows = buildDailyProgressRows(days, profile);
  const trend = weightTrend7d(rows);

  assert.equal(trend.length, 5);
  assert.equal(trend[0].date, "2026-11-01");
  assert.equal(trend[0].trendKg, 78);
  assert.equal(trend[1].trendKg, 77.8); // (78.0 + 77.6) / 2
  assert.equal(trend[2].trendKg, 77.8); // Nov 4 carries 7d window [78.0, 77.6]
  assert.equal(trend[3].trendKg, 77.3); // (77.6 + 77.0) / 2
  assert.equal(trend[4].trendKg, null); // no weigh-ins in Nov 14..20
});

test("computeMetricStats calculates avg, min, max, delta, and targetHitDays across metrics", () => {
  const days: DailyProgressInput[] = [
    makeDay("2026-11-10", {
      weightKg: 76.8,
      kcalIn: 1700,
      proteinG: 180,
      fatG: 50,
      sugarG: 15,
      carbsG: 150,
      activeBurnKcal: 300,
      workoutCount: 1,
    }),
    makeDay("2026-11-11", {
      weightKg: 76.2,
      kcalIn: 2700, // surplus
      proteinG: 140,
      fatG: 85,
      sugarG: 48,
      carbsG: 260,
      activeBurnKcal: 0,
      workoutCount: 0,
    }),
    makeDay("2026-11-12", {
      weightKg: null,
      kcalIn: 0,
      proteinG: 0,
      fatG: 0,
      sugarG: 0,
      carbsG: 0,
      mealCount: 0, // unlogged meal day should not skew averages
      activeBurnKcal: 200,
      workoutCount: 1,
    }),
  ];
  const rows = buildDailyProgressRows(days, profile);

  const prot = computeMetricStats(rows, "protein", { target: 175 });
  assert.equal(prot.sampleCount, 2);
  assert.equal(prot.avg, 160);
  assert.equal(prot.min, 140);
  assert.equal(prot.max, 180);
  assert.equal(prot.delta, -40);
  assert.equal(prot.targetHitDays, 1);
  assert.equal(prot.targetEligibleDays, 2);

  const sugar = computeMetricStats(rows, "sugar", { target: 30 });
  assert.equal(sugar.sampleCount, 2);
  assert.equal(sugar.avg, 31.5);
  assert.equal(sugar.targetHitDays, 1); // 15 <= 30, 48 > 30

  const weight = computeMetricStats(rows, "weight", { target: 76.5 });
  assert.equal(weight.sampleCount, 2);
  assert.equal(weight.delta, -0.6);
  assert.equal(weight.targetHitDays, 1); // 76.2 <= 76.5

  const deficit = computeMetricStats(rows, "deficit");
  assert.equal(deficit.sampleCount, 2);
  assert.equal(deficit.targetHitDays, 1); // Nov 10 deficit, Nov 11 surplus

  const workout = computeMetricStats(rows, "workout");
  assert.equal(workout.sampleCount, 2);
  assert.equal(workout.total, 500);
  assert.equal(workout.avg, 250);
  assert.equal(workout.targetHitDays, 2);
  assert.equal(workout.targetEligibleDays, 3);
});

test("bucketProgressRows keeps daily points for <=45d spans and aggregates weekly for wide spans", () => {
  const days: DailyProgressInput[] = [];
  // Build 70 days from 2026-09-07 (Monday) through 2026-11-15
  const startMs = Date.parse("2026-09-07T12:00:00Z");
  for (let i = 0; i < 70; i++) {
    const date = new Date(startMs + i * 86_400_000).toISOString().slice(0, 10);
    days.push(
      makeDay(date, {
        weightKg: i % 2 === 0 ? 78 - i * 0.03 : null,
        kcalIn: 1750 + (i % 7) * 50,
        proteinG: 165,
        sugarG: 20,
        activeBurnKcal: i % 2 === 0 ? 300 : 0,
        workoutCount: i % 2 === 0 ? 1 : 0,
      }),
    );
  }
  const rows = buildDailyProgressRows(days, profile);

  // 14-day window stays daily
  const dailyBuckets = bucketProgressRows(rows, "2026-11-02", "2026-11-15");
  assert.equal(dailyBuckets.length, 14);
  assert.equal(dailyBuckets.every((b) => !b.isAggregated), true);

  // Full 70-day window buckets into 10 Monday-anchored weekly buckets (no dot spaghetti!)
  const weeklyBuckets = bucketProgressRows(rows, "2026-09-07", "2026-11-15");
  assert.equal(weeklyBuckets.length, 10);
  assert.equal(weeklyBuckets.every((b) => b.isAggregated), true);
  assert.equal(weeklyBuckets[0].startDate, "2026-09-07");
  assert.equal(weeklyBuckets[0].dayCount, 7);
  assert.equal(weeklyBuckets[0].mealDays, 7);
  assert.equal(weeklyBuckets[0].workoutDays, 4);
  assert.equal(weeklyBuckets[0].totalActiveBurnKcal, 1200);
  assert.ok(weeklyBuckets[0].weightTrendKg !== null);
});

test("niceTicks creates readable rounded axis bounds", () => {
  const kcalTicks = niceTicks(0, 2340, 4, true);
  assert.equal(kcalTicks.min, 0);
  assert.ok(kcalTicks.max >= 2340);
  assert.ok(kcalTicks.ticks.length >= 3 && kcalTicks.ticks.length <= 6);

  const wtTicks = niceTicks(74.2, 76.8, 4, false);
  assert.ok(wtTicks.min <= 74.2);
  assert.ok(wtTicks.max >= 76.8);
});
