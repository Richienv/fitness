import { test } from "node:test";
import assert from "node:assert/strict";
import { adjustTarget, MAX_BONUS_KCAL } from "./dayBudget.ts";
import { plannedWorkoutKcal, workoutKcal } from "./burn.ts";

const rest = { kcal: 2000, protein: 150, carbs: 180, fat: 65 };
const gym = { kcal: 2300, protein: 150, carbs: 255, fat: 65 };

test("cardio on a rest day earns a share of the burn, in carbs", () => {
  const a = adjustTarget({ base: rest, rest, burnKcal: 400, eatBack: 0.5 });
  assert.equal(a.bonusKcal, 200);
  assert.deepEqual(a.target, { kcal: 2200, protein: 150, carbs: 230, fat: 65 });
  assert.equal(a.base, rest);
});

test("a normal gym day adds nothing: its target already carries the training", () => {
  const a = adjustTarget({ base: gym, rest, burnKcal: 400, eatBack: 0.5 });
  assert.equal(a.bonusKcal, 0);
  assert.equal(a.target, gym);
});

test("only the burn beyond what the gym-day target assumes is added", () => {
  const a = adjustTarget({ base: gym, rest, burnKcal: 800, eatBack: 0.5 });
  assert.equal(a.bonusKcal, 100); // 2000 + 400 = 2400, 100 over 2300
  assert.equal(a.target.kcal, 2400);
  const b = adjustTarget({ base: gym, rest, burnKcal: 800, eatBack: 0.75 });
  assert.equal(b.bonusKcal, 300); // 2000 + 600 = 2600
});

test("off, nothing logged and nonsense all leave the target alone", () => {
  for (const burnKcal of [0, -50, NaN, Infinity * 0]) {
    const a = adjustTarget({ base: rest, rest, burnKcal, eatBack: 0.5 });
    assert.equal(a.bonusKcal, 0);
    assert.equal(a.target, rest);
  }
  const off = adjustTarget({ base: rest, rest, burnKcal: 900, eatBack: 0 });
  assert.equal(off.bonusKcal, 0);
  // An unknown share falls back to the default (half), not to "all of it".
  assert.equal(adjustTarget({ base: rest, rest, burnKcal: 400, eatBack: 3 }).bonusKcal, 200);
});

test("the bonus is capped and rounded to 10 kcal", () => {
  assert.equal(adjustTarget({ base: rest, rest, burnKcal: 5000, eatBack: 0.75 }).bonusKcal, MAX_BONUS_KCAL);
  assert.equal(adjustTarget({ base: rest, rest, burnKcal: 333, eatBack: 0.5 }).bonusKcal, 170);
});

test("a planned session is estimated like a finished one with every set done", () => {
  const defs = [
    { name: "Bench Press", primary: ["chest"] as const, sets: 4, targetReps: 8 },
    { name: "Squat", primary: ["quad"] as const, sets: 3, targetReps: 10 },
  ];
  const planned = plannedWorkoutKcal(defs, 75);
  const done = workoutKcal(
    defs.map((d) => ({
      name: d.name,
      primary: d.primary,
      sets: Array.from({ length: d.sets }, () => ({ reps: d.targetReps })),
    })),
    75,
  );
  assert.equal(planned.total, done.total);
  assert.ok(planned.total > 0);
  assert.equal(planned.perExercise.length, 2);
  assert.equal(plannedWorkoutKcal(defs, 0).total, 0);
});
