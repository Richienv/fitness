import test from "node:test";
import assert from "node:assert/strict";
import { evaluateHealthAchievements } from "./healthAchievements.ts";

const TODAY = "2026-11-26";

test("sugar < 25g for 3 consecutive real-food days unlocks Jade Zen", () => {
  const res = evaluateHealthAchievements({
    today: TODAY,
    kcalTarget: 2000,
    proteinTarget: 150,
    waterByDate: {},
    workouts: [],
    dailyNutrition: [
      { date: "2026-11-23", kcal: 1850, protein: 140, fat: 48, sugar: 18, hasFood: true },
      { date: "2026-11-24", kcal: 1900, protein: 145, fat: 45, sugar: 21, hasFood: true },
      { date: "2026-11-25", kcal: 1800, protein: 142, fat: 42, sugar: 19, hasFood: true },
    ],
  });

  assert.equal(res.unlockedKeys.has("sugar_3d"), true);
  assert.equal(res.unlockedKeys.has("protein_3d"), true);
  assert.equal(res.unlockedStageIds.has("jade-zen"), true);
  assert.equal(res.unlockedStageIds.has("golden-dawn"), true);
  assert.equal(res.unlockedKeys.has("fat_5d"), false);
});

test("empty 0-kcal days never falsely satisfy low-sugar or low-fat streaks", () => {
  const res = evaluateHealthAchievements({
    today: TODAY,
    kcalTarget: 2000,
    proteinTarget: 150,
    waterByDate: {},
    workouts: [],
    dailyNutrition: [
      { date: "2026-11-23", kcal: 0, protein: 0, fat: 0, sugar: 0, hasFood: false },
      { date: "2026-11-24", kcal: 100, protein: 5, fat: 1, sugar: 2, hasFood: true },
      { date: "2026-11-25", kcal: 1800, protein: 140, fat: 40, sugar: 15, hasFood: true },
    ],
  });

  const sugar = res.items.find((x) => x.key === "sugar_3d")!;
  assert.equal(sugar.unlocked, false);
  assert.equal(sugar.current, 1);
});

test("water >= 2000ml 3 days, 5d fat <= 50g, and 3 workouts in 7 days unlock stages", () => {
  const res = evaluateHealthAchievements({
    today: TODAY,
    kcalTarget: 1900,
    proteinTarget: 120,
    hasPartnerActivity: true,
    waterByDate: {
      "2026-11-23": 2250,
      "2026-11-24": 2000,
      "2026-11-25": 2500,
    },
    workouts: [
      { date: "2026-11-21", completed: true },
      { date: "2026-11-23", completed: true },
      { date: "2026-11-25", completed: true },
    ],
    dailyNutrition: [
      { date: "2026-11-21", kcal: 1800, protein: 120, fat: 46, sugar: 30, hasFood: true },
      { date: "2026-11-22", kcal: 1850, protein: 125, fat: 48, sugar: 28, hasFood: true },
      { date: "2026-11-23", kcal: 1820, protein: 118, fat: 49, sugar: 27, hasFood: true },
      { date: "2026-11-24", kcal: 1880, protein: 130, fat: 44, sugar: 32, hasFood: true },
      { date: "2026-11-25", kcal: 1840, protein: 126, fat: 47, sugar: 29, hasFood: true },
    ],
  });

  assert.equal(res.unlockedStageIds.has("clean-studio"), true);
  assert.equal(res.unlockedStageIds.has("ocean-glass"), true);
  assert.equal(res.unlockedStageIds.has("nordic-mist"), true);
  assert.equal(res.unlockedStageIds.has("ember-forge"), true);
  assert.equal(res.unlockedStageIds.has("aurora-horizon"), true);
  assert.equal(res.unlockedStageIds.has("sakura-loft"), true);
});
