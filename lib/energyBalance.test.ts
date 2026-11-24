import { test } from "node:test";
import assert from "node:assert/strict";
import {
  burnRatePerSecond,
  dayFractionCST,
  energyBalance,
  mealWeightImpact,
  weeksToGoal,
  weightChangeFromKcal,
  type BalanceInput,
} from "./energyBalance.ts";

const richie: BalanceInput = {
  sex: "male",
  kg: 75,
  cm: 175,
  age: 22,
  eatenKcal: 1000,
  targetKcal: 2300,
  activeKcal: 400,
  activeFromHealth: false,
  dayFraction: 0.5,
};

test("normal burn is BMR × 1.2 without a watch, BMR alone with one", () => {
  const a = energyBalance(richie)!;
  assert.equal(a.bmr, 1739); // 10×75 + 6.25×175 − 5×22 + 5
  assert.equal(a.normal, 2087);
  const b = energyBalance({ ...richie, activeFromHealth: true, activeKcal: 700 })!;
  assert.equal(b.normal, 1739); // the watch's active energy already includes daily movement
  assert.equal(b.burnDay, 2439);
});

test("Renita's BMR uses the female constant, so her numbers differ from his", () => {
  const f = energyBalance({ ...richie, sex: "female", kg: 60, cm: 163, age: 22 })!;
  assert.equal(f.bmr, Math.round(10 * 60 + 6.25 * 163 - 5 * 22 - 161));
});

test("until the day closes, the projection assumes the target is eaten", () => {
  const a = energyBalance(richie)!;
  assert.equal(a.intakeFrom, "target");
  assert.equal(a.intake, 2300);
  assert.equal(a.balance, 2487 - 2300); // 2087 + 400 − 2300
  assert.equal(a.fatGrams, Math.round((187 / 7700) * 1000)); // 24 g
  // Eating more than the target moves it at once.
  const over = energyBalance({ ...richie, eatenKcal: 2800 })!;
  assert.equal(over.intake, 2800);
  assert.ok(over.fatGrams < 0 && over.balance < 0);
});

test("once the day is closing, what was really eaten decides", () => {
  const a = energyBalance({ ...richie, dayFraction: 0.95, eatenKcal: 1800 })!;
  assert.equal(a.intakeFrom, "eaten");
  assert.equal(a.balance, 2487 - 1800);
  assert.equal(a.fatGrams, 89);
});

test("so far pro-rates only the normal burn, never the exercise already done", () => {
  const a = energyBalance(richie)!;
  // 1738.75 × 1.2 × half the day + the 400 already burned (rounded once, at the end)
  assert.equal(a.soFar.burn, 1443);
  assert.equal(a.soFar.eaten, 1000);
  assert.equal(a.soFar.balance, a.soFar.burn - 1000);
});

test("a week of the same day, in kg of fat", () => {
  const a = energyBalance({ ...richie, eatenKcal: 2000, targetKcal: 1900, activeKcal: 600 })!;
  // burn 2087 + 600 = 2687, food 2000, deficit 687/day
  assert.equal(a.balance, 687);
  assert.equal(a.kgPerWeek, 0.62);
});

test("nonsense body data or inputs give no estimate, not a wrong one", () => {
  assert.equal(energyBalance({ ...richie, kg: 0 }), null);
  assert.equal(energyBalance({ ...richie, cm: NaN }), null);
  const a = energyBalance({ ...richie, eatenKcal: NaN, activeKcal: -5, dayFraction: 7 })!;
  assert.equal(a.active, 0);
  assert.equal(a.intakeFrom, "eaten"); // fraction clamps to 1: the day is over
});

test("weeks to goal only when the pace points at it", () => {
  assert.equal(weeksToGoal(76, 73, 0.5), 6);
  assert.equal(weeksToGoal(76, 73, -0.2), null); // gaining
  assert.equal(weeksToGoal(76, 73, 0.01), null); // too slow to mean anything
  assert.equal(weeksToGoal(72, 73, 0.5), null); // already there
  assert.equal(weeksToGoal(120, 60, 0.06), null); // over two years
});

test("the day fraction follows China Standard Time with second-level resolution", () => {
  // 04:00:00 UTC = 12:00:00 in Shanghai
  assert.equal(dayFractionCST(new Date("2026-11-24T04:00:00Z")), 0.5);
  assert.equal(dayFractionCST(new Date("2026-11-24T16:00:00Z")), 0); // 00:00:00 next day
  // 1 second later ticks strictly forward by 1 / 86400
  const oneSecLater = dayFractionCST(new Date("2026-11-24T04:00:01Z"));
  assert.ok(Math.abs(oneSecLater - (0.5 + 1 / 86400)) < 1e-12);
});

test("stop-eating projection reacts immediately to every meal and includes body weight beyond pure fat", () => {
  const beforeLunch = energyBalance({ ...richie, eatenKcal: 400 })!;
  const afterLunch = energyBalance({ ...richie, eatenKcal: 1000 })!;
  // Stop-eating body weight drop is larger than pure fat alone because of tissue + glycogen/water
  assert.ok(beforeLunch.stopEating.bodyGrams > beforeLunch.stopEating.fatGrams);
  assert.ok(beforeLunch.stopEating.glycogenWaterGrams > 0);
  // Logging a 600 kcal lunch immediately reduces the stop-eating weight drop
  assert.ok(afterLunch.stopEating.bodyKg < beforeLunch.stopEating.bodyKg);
  assert.ok(afterLunch.stopEating.weightKg > beforeLunch.stopEating.weightKg);
  // Full 24h fast for 75 kg male (~2087 kcal) drops realistic ~0.5–0.65 kg total weight (~0.27 kg pure fat)
  const fast = weightChangeFromKcal(2087, 75);
  assert.ok(fast.bodyKg > 0.5 && fast.bodyKg < 0.65);
  assert.ok(fast.fatKg > 0.25 && fast.fatKg < 0.29);
  // Glycogen water saturates smoothly and never explodes on extreme numbers
  const extreme = weightChangeFromKcal(10000, 75);
  assert.ok(extreme.glycogenWaterGrams <= 360);
});

test("per-second burn rate matches the exact numerical derivative of body weight over 1 second", () => {
  const t0 = energyBalance({ ...richie, dayFraction: 0.5 })!;
  const t1 = energyBalance({ ...richie, dayFraction: 0.5 + 1 / 86400 })!;
  const observedKgDrop = t1.soFar.weight.bodyKg - t0.soFar.weight.bodyKg;
  assert.ok(observedKgDrop > 0);
  // Analytical derivative rate.bodyKgPerSecond matches the actual 1-second delta within 0.1%
  assert.ok(
    Math.abs(observedKgDrop - t0.rate.bodyKgPerSecond) / observedKgDrop < 0.001,
  );
  // Body weight drops faster per second than pure fat alone
  assert.ok(t0.rate.bodyKgPerSecond > t0.rate.fatKgPerSecond);
});

test("mealWeightImpact quantifies each meal's real-time weight, fat, and burn duration", () => {
  const impact = mealWeightImpact(600, 2087, 1500);
  assert.equal(impact.kcal, 600);
  assert.ok(impact.fatGrams > 75 && impact.fatGrams < 80); // 600 / 7700 = 77.9 g
  assert.ok(impact.bodyGrams > impact.fatGrams);
  // 600 / 2087 * 1440 ≈ 414 minutes (~6h 54m)
  assert.ok(impact.burnMinutes >= 410 && impact.burnMinutes <= 418);
});
