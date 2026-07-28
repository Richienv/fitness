import { test } from "node:test";
import assert from "node:assert/strict";
import { healthScore, estimateSteps, WEIGHTS } from "./healthScore.ts";

const base = {
  kcal: 2200,
  kcalTarget: 2200,
  protein: 150,
  proteinTarget: 150,
  sugar: 0,
  fat: 0,
  sessions: 2,
};

test("a perfect day scores 100", () => {
  assert.equal(healthScore(base).total, 100);
});

test("a day with nothing logged scores 0, not a free 'no sugar' win", () => {
  const s = healthScore({ ...base, kcal: 0, protein: 0, sessions: 0 });
  assert.equal(s.total, 0);
  assert.equal(s.gula, 0);
});

test("calories are scored on target, so under counts as a miss too", () => {
  const over = healthScore({ ...base, kcal: 2200 * 1.2 });
  const under = healthScore({ ...base, kcal: 2200 * 0.8 });
  assert.ok(over.kalori < WEIGHTS.kalori);
  // Symmetric: 20% either side loses the same amount.
  assert.equal(Math.round(over.kalori), Math.round(under.kalori));
});

test("protein is a floor — exceeding it is not penalised", () => {
  const exact = healthScore(base);
  const over = healthScore({ ...base, protein: 220 });
  assert.equal(over.protein, WEIGHTS.protein);
  assert.equal(over.protein, exact.protein);
});

test("sugar and fat are ceilings", () => {
  const sweet = healthScore({ ...base, sugar: 50 });
  assert.equal(sweet.gula, 0);
  const greasy = healthScore({ ...base, fat: 500 });
  assert.equal(greasy.lemak, 0);
});

test("sessions cap out at two", () => {
  const one = healthScore({ ...base, sessions: 1 });
  const four = healthScore({ ...base, sessions: 4 });
  assert.ok(one.sesi < WEIGHTS.sesi);
  assert.equal(four.sesi, WEIGHTS.sesi);
});

test("score never leaves 0..100", () => {
  const awful = healthScore({ ...base, kcal: 9000, protein: 0, sugar: 400, fat: 400, sessions: 0 });
  assert.ok(awful.total >= 0 && awful.total <= 100);
  const great = healthScore(base);
  assert.ok(great.total >= 0 && great.total <= 100);
});

test("steps scale with distance and shrink with height", () => {
  assert.equal(estimateSteps(0, 178), 0);
  const tall = estimateSteps(5000, 190);
  const short = estimateSteps(5000, 160);
  assert.ok(short > tall, "a shorter stride means more steps for the same distance");
  // 5 km at 178 cm ≈ 4320 steps
  assert.ok(Math.abs(estimateSteps(5000, 178) - 4320) < 40);
});
