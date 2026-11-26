import { test } from "node:test";
import assert from "node:assert/strict";
import {
  weightSummary,
  companionProgress,
  goalRatio,
  levelFromWeight,
  unlockRequirementForLevel,
  type CompanionGoal,
} from "./companionProgress.ts";
import type { WorkoutSession } from "./workouts";

const renitaGoal: CompanionGoal = {
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

const richieGoal: CompanionGoal = {
  mode: "weight",
  baselineDate: "2026-11-01",
  baselineWeight: 76,
  targetWeight: 73,
  baselineWaist: null,
  targetWaist: null,
  exercise: "Bench press",
  reps: 8,
  baselineLift: null,
  targetLift: null,
};

test("weightSummary calendar window excludes old, future, invalid and duplicate-day readings", () => {
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

test("instant touch-to-unlock unlocks immediately even with 1 weigh-in and crosses multiple levels", () => {
  const reqLv2 = unlockRequirementForLevel(renitaGoal, 2, 46);
  assert.equal(reqLv2.kind, "weight");
  // Touching Lv 2 threshold on a single weigh-in unlocks Lv 2 right away
  const oneTouch = companionProgress(
    renitaGoal,
    [{ date: "2026-11-14", weightKg: reqLv2.requiredKg }],
    [],
    "2026-11-14",
  );
  assert.equal(oneTouch.level, 2);
  assert.equal(oneTouch.highestLevel, 2);
  assert.equal(oneTouch.previousLevel, null);
  assert.equal(oneTouch.demoted, false);
  assert.equal(oneTouch.demotedFrom, null);

  // One weigh-in reaching target immediately awards level 12
  const oneTarget = companionProgress(
    renitaGoal,
    [{ date: "2026-11-14", weightKg: 43 }],
    [],
    "2026-11-14",
  );
  assert.equal(oneTarget.level, 12);
  assert.equal(oneTarget.fraction, 1);

  // Jumping directly to 45.0 kg (1/3 of 46 -> 43) jumps straight to level 4
  const multiJump = companionProgress(
    renitaGoal,
    [
      { date: "2026-11-01", weightKg: 46 },
      { date: "2026-11-05", weightKg: 45.0 },
    ],
    [],
    "2026-11-14",
  );
  assert.equal(multiJump.level, 4);
  assert.equal(multiJump.previousLevel, 1);
  assert.equal(multiJump.highestLevel, 4);
  assert.equal(multiJump.demoted, false);
});

test("weight climb causes immediate level-down (mundur level) and re-unlocks when dropping back", () => {
  const rowsAfterGain = [
    { date: "2026-11-01", weightKg: 46.0 },
    { date: "2026-11-05", weightKg: 45.0 }, // Lv 4
    { date: "2026-11-07", weightKg: 45.5 }, // goes up -> drops to Lv 2
  ];
  const demoted = companionProgress(renitaGoal, rowsAfterGain, [], "2026-11-07");
  assert.equal(demoted.level, 2);
  assert.equal(demoted.highestLevel, 4);
  assert.equal(demoted.previousLevel, 4);
  assert.equal(demoted.demoted, true);
  assert.equal(demoted.demotedFrom, 4);

  // Re-unlocks when weight drops back down below Lv 4 threshold
  const recovered = companionProgress(
    renitaGoal,
    [...rowsAfterGain, { date: "2026-11-09", weightKg: 44.8 }],
    [],
    "2026-11-09",
  );
  assert.equal(recovered.level, 5);
  assert.equal(recovered.highestLevel, 5);
  assert.equal(recovered.previousLevel, 2);
  assert.equal(recovered.demoted, false);
  assert.equal(recovered.demotedFrom, null);
});

test("highestLevel scopes to baselineDate and falls back when all weigh-ins predate baselineDate", () => {
  const rows = [
    { date: "2026-10-25", weightKg: 43.0 }, // pre-baseline outlier (Lv 12)
    { date: "2026-11-02", weightKg: 45.5 }, // Lv 2
    { date: "2026-11-04", weightKg: 45.8 }, // Lv 1
  ];
  const res = companionProgress(renitaGoal, rows, [], "2026-11-05");
  assert.equal(res.level, 1);
  assert.equal(res.highestLevel, 2);
  assert.equal(res.demoted, true);
  assert.equal(res.demotedFrom, 2);

  // If no rows exist on/after baselineDate, fallback still computes from <= today
  const preOnly = companionProgress(
    { ...renitaGoal, baselineDate: "2026-11-20" },
    [{ date: "2026-11-10", weightKg: 44.5 }],
    [],
    "2026-11-25",
  );
  assert.equal(preOnly.level, 6);
  assert.equal(preOnly.highestLevel, 6);
});

test("weight-gain goal unlocks on rising weight and demotes on weight drop", () => {
  const bulkGoal: CompanionGoal = {
    ...richieGoal,
    baselineWeight: 55,
    targetWeight: 66,
  };
  const gainProg = companionProgress(
    bulkGoal,
    [
      { date: "2026-11-01", weightKg: 55 },
      { date: "2026-11-04", weightKg: 59 }, // Lv 5
      { date: "2026-11-06", weightKg: 57 }, // Lv 3 (mundur)
    ],
    [],
    "2026-11-06",
  );
  assert.equal(gainProg.level, 3);
  assert.equal(gainProg.highestLevel, 5);
  assert.equal(gainProg.previousLevel, 5);
  assert.equal(gainProg.demoted, true);
  assert.equal(gainProg.demotedFrom, 5);
});

test("levelFromWeight and fallback baseline handle independent Richie vs Renita curves", () => {
  assert.equal(levelFromWeight(76, richieGoal), 1);
  assert.equal(levelFromWeight(74.5, richieGoal), 6);
  assert.equal(levelFromWeight(73, richieGoal), 12);

  // Same 74.5 kg on Renita's 46 -> 43 curve is above baseline (Lv 1), while Renita's 44.5 is Lv 6
  assert.equal(levelFromWeight(44.5, renitaGoal), 6);
  assert.equal(levelFromWeight(43, renitaGoal), 12);

  // Null baselineWeight uses fallbackBaselineKg or earliest measurement
  const noBase: CompanionGoal = { ...renitaGoal, baselineWeight: null };
  assert.equal(levelFromWeight(44.5, noBase, 46), 6);
  const fromRows = companionProgress(
    noBase,
    [
      { date: "2026-11-01", weightKg: 46 },
      { date: "2026-11-03", weightKg: 44.5 },
    ],
    [],
    "2026-11-05",
  );
  assert.equal(fromRows.level, 6);
});

test("invalid targets never produce a score", () => {
  assert.equal(goalRatio(45, 46, 46), null);
  assert.equal(goalRatio(NaN, 46, 43), null);
  assert.equal(goalRatio(47, 46, 43), 0);
  assert.equal(goalRatio(42, 46, 43), 1);
});

test("recomposition requires both outcomes and comparable sets", () => {
  const g = {
    ...renitaGoal,
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
    const req = unlockRequirementForLevel(renitaGoal, targetLevel, 46);
    assert.equal(req.kind, "weight");
    assert.equal(req.level, targetLevel);
    assert.equal(req.direction, "loss");
    assert.equal(req.estimated, false);
    const expectedKg = 46 + ((targetLevel - 1) / 11) * (43 - 46);
    assert.ok(Math.abs(req.requiredKg - expectedKg) < 1e-9);
    assert.ok(Math.abs((req.remainingKg ?? -1) - (46 - expectedKg)) < 1e-9);
    assert.equal(req.alreadyReached, false);

    // Feeding requiredKg into a single weigh-in unlocks targetLevel immediately.
    const rows = [{ date: "2026-11-14", weightKg: req.requiredKg }];
    assert.equal(companionProgress(renitaGoal, rows, [], "2026-11-14").level, targetLevel);
  }
});

test("unlockRequirementForLevel handles weight gain and remaining distance", () => {
  const bulkGoal: CompanionGoal = {
    ...renitaGoal,
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

test("unlockRequirementForLevel flags alreadyReached when weight touched threshold and supports fallbackBaselineKg", () => {
  const req = unlockRequirementForLevel(renitaGoal, 2, 44.5);
  assert.equal(req.kind, "weight");
  assert.equal(req.alreadyReached, true);

  const uncalibrated: CompanionGoal = {
    ...renitaGoal,
    baselineWeight: null,
    targetWeight: 43,
  };
  const withFallback = unlockRequirementForLevel(uncalibrated, 6, 45.0, 46);
  assert.equal(withFallback.kind, "weight");
  assert.equal(withFallback.estimated, false);
  assert.ok(Math.abs(withFallback.requiredKg - (46 + (5 / 11) * -3)) < 1e-9);

  const est = unlockRequirementForLevel(uncalibrated, 12, 45.2);
  assert.equal(est.kind, "weight");
  assert.equal(est.estimated, true);
  assert.equal(est.requiredKg, 43);
});

test("unlockRequirementForLevel supports pure recomp and unconfigured/clamped edge cases", () => {
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
    unlockRequirementForLevel({ ...renitaGoal, targetWeight: 46 }, 4, 46).kind,
    "unconfigured",
  );
  assert.equal(unlockRequirementForLevel(renitaGoal, 99, 46).level, 12);
  assert.equal(unlockRequirementForLevel(renitaGoal, 0, 46).level, 1);
});
