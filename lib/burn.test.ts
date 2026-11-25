import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ACTIVITY_KINDS,
  activityKcal,
  bodyWeightKg,
  defaultWorkingWeightKg,
  estimated1RM,
  getExerciseProfile,
  plannedWorkoutKcal,
  setBurnDetails,
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

test("compound leg work costs substantially more than upper compound or arm isolation", () => {
  const curl = setBurnDetails({ name: "Barbell Curl", primary: ["bicep"], weight: 25, reps: 10, bodyKg: 75 });
  const bench = setBurnDetails({ name: "Bench Press", primary: ["chest"], weight: 70, reps: 10, bodyKg: 75 });
  const squat = setBurnDetails({ name: "Squat", primary: ["quad"], weight: 100, reps: 10, bodyKg: 75 });

  assert.ok(squat.kcal > bench.kcal, `squat ${squat.kcal} should exceed bench ${bench.kcal}`);
  assert.ok(bench.kcal > curl.kcal, `bench ${bench.kcal} should exceed curl ${curl.kcal}`);
  assert.ok(squat.mechanicalKcal > curl.mechanicalKcal * 3);
  assert.ok(squat.epocKcal > curl.epocKcal * 2);

  // Baseline setKcal preserves muscle-size ordering.
  const b = setKcal(["bicep"], 75);
  const c = setKcal(["chest"], 75);
  const q = setKcal(["quad"], 75);
  assert.ok(q > c && c > b);
});

test("heavier weights and higher reps meaningfully increase energy burn and tonnage", () => {
  const lightCurl = workoutKcal(
    [{ name: "Barbell Curl", primary: ["bicep"], sets: [{ weight: 10, reps: 8 }, { weight: 10, reps: 8 }, { weight: 10, reps: 8 }] }],
    75,
  );
  const heavyCurl = workoutKcal(
    [{ name: "Barbell Curl", primary: ["bicep"], sets: [{ weight: 35, reps: 12 }, { weight: 35, reps: 12 }, { weight: 35, reps: 12 }] }],
    75,
  );
  assert.ok(heavyCurl.total > lightCurl.total * 1.4);
  assert.equal(lightCurl.breakdown.tonnageKg, 240);
  assert.equal(heavyCurl.breakdown.tonnageKg, 1260);

  const lightSquat = workoutKcal(
    [{ name: "Squat", primary: ["quad"], sets: [{ weight: 40, reps: 6 }, { weight: 40, reps: 6 }] }],
    75,
  );
  const heavySquat = workoutKcal(
    [{ name: "Squat", primary: ["quad"], sets: [{ weight: 120, reps: 10 }, { weight: 120, reps: 10 }] }],
    75,
  );
  assert.ok(heavySquat.total > lightSquat.total * 1.6);
  assert.ok(heavySquat.breakdown.mechanicalKcal > lightSquat.breakdown.mechanicalKcal);
  assert.ok(heavySquat.breakdown.epocKcal > lightSquat.breakdown.epocKcal);
});

test("per-hand dumbbells, unilateral moves, and assisted pull-ups calculate biomechanically", () => {
  // 12.5 kg per DB Hammer Curl (25 kg total) is close in work to 25 kg Barbell Curl.
  const bbCurl = setBurnDetails({ name: "Barbell Curl", primary: ["bicep"], weight: 25, reps: 10, bodyKg: 75 });
  const dbCurl = setBurnDetails({ name: "Hammer Curl", primary: ["bicep"], weight: 12.5, reps: 10, bodyKg: 75 });
  assert.equal(bbCurl.tonnageKg, 250);
  assert.equal(dbCurl.tonnageKg, 250);
  assert.ok(Math.abs(bbCurl.kcal - dbCurl.kcal) < 1.5);

  // Unilateral DB Row logs both sides per set -> 20 total reps of work.
  const dbRow = setBurnDetails({ name: "DB Row", primary: ["midBack"], weight: 20, reps: 10, bodyKg: 75 });
  assert.equal(dbRow.tonnageKg, 400);

  // Assisted pull-up subtracts counterweight: less assistance = heavier effective load & higher burn.
  const easyAssist = setBurnDetails({ name: "Pull-up (Assisted)", primary: ["lats"], weight: 40, reps: 8, bodyKg: 75 });
  const hardAssist = setBurnDetails({ name: "Pull-up (Assisted)", primary: ["lats"], weight: 10, reps: 8, bodyKg: 75 });
  assert.ok(hardAssist.kcal > easyAssist.kcal);
  assert.ok(hardAssist.effectiveLoadKg > easyAssist.effectiveLoadKg);
});

test("a workout adds up logged sets with actual weights and ignores zero-rep sets", () => {
  const w = workoutKcal(
    [
      {
        name: "Bench Press",
        primary: ["chest"],
        sets: [
          { weight: 60, reps: 8 },
          { weight: 65, reps: 8 },
          { weight: 65, reps: 7 },
        ],
      },
      {
        name: "Barbell Curl",
        primary: ["bicep"],
        sets: [
          { weight: 20, reps: 12 },
          { weight: 20, reps: 0 },
        ],
      },
      { name: "Skipped", primary: ["quad"], sets: [] },
    ],
    75,
  );
  assert.equal(w.perExercise.length, 2);
  assert.equal(w.perExercise[0].name, "Bench Press");
  assert.equal(w.perExercise[0].sets, 3);
  assert.equal(w.perExercise[0].tonnageKg, 60 * 8 + 65 * 8 + 65 * 7);
  assert.equal(w.perExercise[1].name, "Barbell Curl");
  assert.equal(w.perExercise[1].sets, 1);
  assert.equal(w.perExercise[1].tonnageKg, 240);
  assert.ok(w.total > 20 && w.total < 60);
  assert.ok(w.perExercise[0].kcal > w.perExercise[1].kcal * 3);
  assert.ok(w.breakdown.mechanicalKcal > 0 && w.breakdown.metabolicKcal > 0 && w.breakdown.epocKcal > 0);
});

test("estimated 1RM and default working weights behave sensibly", () => {
  assert.equal(estimated1RM(60, 1), 60);
  assert.equal(estimated1RM(60, 10), 80); // 60 * (1 + 10/30)
  assert.equal(estimated1RM(0, 10), 0);

  const squatDefault = defaultWorkingWeightKg("Squat", 75, ["quad"], "male");
  const curlDefault = defaultWorkingWeightKg("Barbell Curl", 75, ["bicep"], "male");
  const dipsDefault = defaultWorkingWeightKg("Dips", 75, ["chest"], "male");
  assert.ok(squatDefault > curlDefault * 2);
  assert.ok(curlDefault >= 15 && curlDefault <= 30);
  assert.equal(dipsDefault, 0);

  // Timed cardio inside sessions computes real duration burn instead of 1 tiny set.
  const cardioPlan = plannedWorkoutKcal(
    [{ name: "Incline Treadmill Walk", primary: ["quad"], sets: 1, targetReps: 40 }],
    70,
  );
  assert.ok(cardioPlan.total > 200);
  assert.equal(getExerciseProfile("Barbell Curl", ["bicep"]).compound, false);
  assert.equal(getExerciseProfile("Squat", ["quad"]).compound, true);
});
