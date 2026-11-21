import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ACTIVITY_KINDS,
  activityKcal,
  bodyWeightKg,
  setKcal,
  workoutKcal,
} from "./burn.ts";

test("body weight: latest weigh-in, else profile, else 70 kg", () => {
  assert.equal(
    bodyWeightKg(
      [
        { date: "2026-11-01", weightKg: 77 },
        { date: "2026-11-20", weightKg: 75.4 },
        { date: "2026-11-21", waistCm: 80 },
      ],
      80,
    ),
    75.4,
  );
  assert.equal(bodyWeightKg([], 80), 80);
  assert.equal(bodyWeightKg([], null), 70);
});

test("steps, minutes and reps count active calories only", () => {
  // Active, like Apple Watch: what the body burns on top of resting.
  // 10.000 steps at 73 kg ≈ 285 kcal (about 0.03 kcal a step).
  assert.equal(Math.round(activityKcal({ kind: "langkah", steps: 10000 }, 73)), 285);
  // 30 min moderate cycling at 75 kg: (6.8 − 1) × 75 × 0.5 = 217.5.
  assert.equal(
    Math.round(activityKcal({ kind: "sepeda", minutes: 30, intensity: "sedang" }, 75)),
    218,
  );
  // 40 push-ups at 75 kg: 40 × 0.0065 × 75 = 19.5.
  assert.equal(Math.round(activityKcal({ kind: "pushup", reps: 40 }, 75)), 20);
  // Missing numbers burn nothing rather than something made up.
  assert.equal(activityKcal({ kind: "sepeda" }, 75), 0);
  assert.equal(activityKcal({ kind: "pushup", reps: -3 }, 75), 0);
});

test("every activity kind says how it is entered", () => {
  for (const k of ACTIVITY_KINDS) {
    assert.ok(["steps", "minutes", "reps"].includes(k.input), k.key);
    assert.ok(k.label.length > 0);
  }
});

test("a gym set costs more for legs than for arms", () => {
  const bicep = setKcal(["bicep"], 75);
  const squat = setKcal(["quad"], 75);
  const bench = setKcal(["chest"], 75);
  assert.equal(Math.round(bench), 6);
  assert.ok(squat > bench && bench > bicep);
  // Three sets of bicep curls at 75 kg ≈ 12 active kcal.
  assert.equal(Math.round(bicep * 3), 12);
});

test("a workout adds up its logged sets, per exercise", () => {
  const w = workoutKcal(
    [
      { name: "Bench Press", primary: ["chest"], sets: [{ reps: 8 }, { reps: 8 }, { reps: 7 }] },
      { name: "Bicep Curl", primary: ["bicep"], sets: [{ reps: 12 }, { reps: 0 }] },
      { name: "Skipped", primary: ["quad"], sets: [] },
    ],
    75,
  );
  assert.deepEqual(
    w.perExercise.map((e) => [e.name, e.sets, Math.round(e.kcal)]),
    [
      ["Bench Press", 3, 17],
      ["Bicep Curl", 1, 4],
    ],
  );
  assert.equal(Math.round(w.total), 21);
});
