import { test } from "node:test";
import assert from "node:assert/strict";
import {
  weightSummary,
  companionProgress,
  goalRatio,
  unlockRequirementForLevel,
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

test("unlockRequirementForLevel computes exact weight-loss thresholds for levels 2..12 and round-trips", () => {
  for (let targetLevel = 2; targetLevel <= 12; targetLevel++) {
    const req = unlockRequirementForLevel(goal, targetLevel, 46);
    assert.equal(req.kind, "weight");
    assert.equal(req.level, targetLevel);
    assert.equal(req.direction, "loss");
    assert.equal(req.estimated, false);
    const expectedKg = 46 + ((targetLevel - 1) / 11) * (43 - 46);
    assert.ok(Math.abs(req.requiredKg - expectedKg) < 1e-9);
    assert.ok(Math.abs((req.remainingKg ?? -1) - (46 - expectedKg)) < 1e-9);
    assert.equal(req.alreadyReached, false);

    // Feeding requiredKg back into companionProgress across two 7-day means unlocks targetLevel.
    const rows = [5, 6, 7, 10, 11, 14].map((d) => ({
      date: `2026-11-${String(d).padStart(2, "0")}`,
      weightKg: req.requiredKg,
    }));
    assert.equal(companionProgress(goal, rows, [], "2026-11-14").level, targetLevel);
  }
});

test("unlockRequirementForLevel handles weight gain and remaining distance", () => {
  const bulkGoal: CompanionGoal = {
    ...goal,
    baselineWeight: 55,
    targetWeight: 66,
  };
  const lv2 = unlockRequirementForLevel(bulkGoal, 2, 55.4);
  assert.equal(lv2.kind, "weight");
  assert.equal(lv2.direction, "gain");
  assert.equal(lv2.requiredKg, 56);
  assert.ok(Math.abs((lv2.remainingKg ?? -1) - 0.6) < 1e-9);
  assert.equal(lv2.alreadyReached, false);

  const lv12 = unlockRequirementForLevel(bulkGoal, 12, 60);
  assert.equal(lv12.kind, "weight");
  assert.equal(lv12.requiredKg, 66);
  assert.equal(lv12.remainingKg, 6);
});

test("unlockRequirementForLevel flags alreadyReached when single weight passed threshold awaiting 7-day stability", () => {
  const req = unlockRequirementForLevel(goal, 2, 44.5);
  assert.equal(req.kind, "weight");
  assert.equal(req.alreadyReached, true);
  assert.ok(Math.abs((req.remainingKg ?? -1) - Math.abs(44.5 - req.requiredKg)) < 1e-9);
});

test("unlockRequirementForLevel falls back to currentKg when baselineWeight is uncalibrated", () => {
  const uncalibrated: CompanionGoal = {
    ...goal,
    baselineWeight: null,
    targetWeight: 43,
  };
  const req = unlockRequirementForLevel(uncalibrated, 12, 45.2);
  assert.equal(req.kind, "weight");
  assert.equal(req.estimated, true);
  assert.equal(req.requiredKg, 43);
  assert.ok(Math.abs((req.remainingKg ?? -1) - 2.2) < 1e-9);

  const lv2 = unlockRequirementForLevel(uncalibrated, 2, 45.2);
  assert.equal(lv2.kind, "weight");
  assert.equal(lv2.estimated, true);
  assert.ok(Math.abs(lv2.requiredKg - 45) < 1e-9);
});

test("unlockRequirementForLevel supports pure recomp without weight target and unconfigured/clamped edge cases", () => {
  const pureRecomp: CompanionGoal = {
    mode: "recomp",
    baselineDate: "2026-11-01",
    baselineWeight: null,
    targetWeight: null,
    baselineWaist: 82,
    targetWaist: 76,
    exercise: "Bench press",
    reps: 8,
    baselineLift: 50,
    targetLift: 61,
  };
  const req = unlockRequirementForLevel(pureRecomp, 2);
  assert.equal(req.kind, "recomp");
  assert.ok(Math.abs(req.requiredWaistCm - (82 - 6 / 11)) < 1e-9);
  assert.equal(req.requiredLiftKg, 51);
  assert.equal(req.exercise, "Bench press");
  assert.equal(req.reps, 8);

  assert.equal(unlockRequirementForLevel(null, 3).kind, "unconfigured");
  assert.equal(
    unlockRequirementForLevel({ ...goal, targetWeight: 46 }, 4, 46).kind,
    "unconfigured",
  );
  assert.equal(unlockRequirementForLevel(goal, 99, 46).level, 12);
  assert.equal(unlockRequirementForLevel(goal, 0, 46).level, 1);
});
