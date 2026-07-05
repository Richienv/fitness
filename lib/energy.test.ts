import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mifflinBMR,
  computeTargets,
  CALORIE_FLOOR,
  FAT_MIN_PER_KG,
} from "./energy.ts";

test("Mifflin-St Jeor — male", () => {
  // 10*80 + 6.25*180 - 5*30 + 5 = 1780
  assert.equal(mifflinBMR("male", 80, 180, 30), 1780);
});

test("Mifflin-St Jeor — female", () => {
  // 10*60 + 6.25*165 - 5*30 - 161 = 1320.25
  assert.equal(mifflinBMR("female", 60, 165, 30), 1320.25);
});

test("female fat_loss target — sane numbers + fat floor applied", () => {
  const r = computeTargets({
    sex: "female",
    goal: "fat_loss",
    weightKg: 60,
    heightCm: 165,
    age: 30,
    activity: 1.5,
  });
  // tdee ≈ 1980, minus 375 deficit ≈ 1605 (above the 1400 floor)
  assert.equal(r.kcal, 1605);
  assert.equal(r.flooredCalories, false);
  // protein 1.8 g/kg
  assert.equal(r.protein, 108);
  // fat default (25% kcal ≈ 45g) lifted to the 0.8 g/kg floor (48g)
  assert.equal(r.fat, Math.round(FAT_MIN_PER_KG * 60));
  assert.equal(r.flooredFat, true);
});

test("calorie floor enforced with warning", () => {
  const r = computeTargets({
    sex: "female",
    goal: "fat_loss",
    weightKg: 45,
    heightCm: 150,
    age: 40,
    activity: 1.2,
  });
  assert.equal(r.kcal, CALORIE_FLOOR);
  assert.equal(r.flooredCalories, true);
  assert.ok(r.warnings.some((w) => w.includes(String(CALORIE_FLOOR))));
});

test("male target unchanged path — computeTargets returns male numbers", () => {
  const r = computeTargets({
    sex: "male",
    goal: "maintain",
    weightKg: 80,
    heightCm: 180,
    age: 30,
    activity: 1.5,
  });
  // bmr 1780 * 1.5 = 2670, maintain (no delta)
  assert.equal(r.kcal, 2670);
  assert.equal(r.protein, 144); // 1.8 * 80
});
