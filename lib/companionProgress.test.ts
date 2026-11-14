import { test } from "node:test";
import assert from "node:assert/strict";
import {
  weightSummary,
  companionProgress,
  goalRatio,
  type CompanionGoal,
} from "./companionProgress.ts";
import type { WorkoutSession } from "./workouts.ts";
const goal: CompanionGoal = {
  mode: "weight",
  baselineDate: "2026-11-01",
  baselineWeight: 46,
  targetWeight: 43,
  baselineWaist: null,
  targetWaist: null,
  exercise: "Bench press",
  reps: 8,
  baselineLift: null,
  targetLift: null,
};
test("calendar window excludes old, future, invalid and duplicate-day readings", () => {
  const s = weightSummary(
    [
      { date: "2026-10-01", weightKg: 99 },
      { date: "2026-11-10", weightKg: 45 },
      { date: "2026-11-11", weightKg: 46 },
      { date: "2026-11-12", weightKg: 44 },
      { date: "2026-11-12", weightKg: 44 },
      { date: "2026-11-15", weightKg: 90 },
      { date: "2026-11-13", weightKg: NaN },
    ],
    "2026-11-14",
  );
  assert.equal(s.count, 3);
  assert.equal(s.mean, 45);
  assert.equal(s.latest?.weightKg, 44);
});
test("sparse records do not become a trend or calibrated level", () => {
  const rows = [{ date: "2026-11-14", weightKg: 43 }];
  assert.equal(weightSummary(rows, "2026-11-14").mean, null);
  assert.equal(companionProgress(goal, rows, [], "2026-11-14").level, null);
});
test("one low weigh-in cannot immediately award the target level", () => {
  const rows = [5, 6, 7]
    .map((d) => ({ date: `2026-11-0${d}`, weightKg: 46 }))
    .concat([10, 11, 14].map((d) => ({ date: `2026-11-${d}`, weightKg: 43 })));
  assert.equal(companionProgress(goal, rows, [], "2026-11-14").level, 1);
});
test("two complete weekly trends reaching target map to level 12", () => {
  const rows = [5, 6, 7, 10, 11, 14].map((d) => ({
    date: `2026-11-${String(d).padStart(2, "0")}`,
    weightKg: 43,
  }));
  assert.equal(companionProgress(goal, rows, [], "2026-11-14").level, 12);
});
test("invalid targets never produce a score", () => {
  assert.equal(goalRatio(45, 46, 46), null);
  assert.equal(goalRatio(NaN, 46, 43), null);
  assert.equal(goalRatio(47, 46, 43), 0);
  assert.equal(goalRatio(42, 46, 43), 1);
});
test("recomposition requires both outcomes and comparable sets", () => {
  const g = {
    ...goal,
    mode: "recomp" as const,
    baselineWaist: 82,
    targetWaist: 76,
    baselineLift: 50,
    targetLift: 60,
  };
  const rows = [
    { date: "2026-11-07", waistCm: 79 },
    { date: "2026-11-14", waistCm: 79 },
  ];
  const make = (date: string, reps: number, skipped = false) =>
    ({
      date,
      completed: true,
      exercises: [
        { exerciseName: "Bench press", skipped, sets: [{ weight: 55, reps }] },
      ],
    }) as WorkoutSession;
  const ws = [make("2026-11-07", 8), make("2026-11-14", 8)];
  assert.equal(companionProgress(g, rows, ws, "2026-11-14").level, 6);
  assert.equal(
    companionProgress(g, rows, [ws[0], make("2026-11-14", 10)], "2026-11-14")
      .level,
    null,
  );
  assert.equal(
    companionProgress(
      g,
      rows,
      [ws[0], make("2026-11-14", 8, true)],
      "2026-11-14",
    ).level,
    null,
  );
  assert.equal(companionProgress(g, [], ws, "2026-11-14").level, null);
});
