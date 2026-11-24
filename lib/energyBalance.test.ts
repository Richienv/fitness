import { test } from "node:test";
import assert from "node:assert/strict";
import { dayFractionCST, energyBalance, weeksToGoal, type BalanceInput } from "./energyBalance.ts";

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

test("the day fraction follows China Standard Time", () => {
  // 04:00 UTC = 12:00 in Shanghai
  assert.equal(dayFractionCST(new Date("2026-11-24T04:00:00Z")), 0.5);
  assert.equal(dayFractionCST(new Date("2026-11-24T16:00:00Z")), 0); // 00:00 next day
});
