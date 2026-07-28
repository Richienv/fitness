// Calibration (spec §4).
//
// Confidence is shown to the user as a percentage, so it has to MEAN
// something: of the things shown at "86% yakin", roughly 86% should turn out
// to be wanted.
//
// There is no real acceptance data yet — the outcome log starts empty on every
// device — so this replays a SIMULATED user whose accept/decline behaviour is
// generated independently of anything the engine computes. That's what stops
// the test being a tautology: the ground truth is the generative process, and
// the engine only ever sees the meals it produced.
//
// If this fails, the scoring is miscalibrated. Retune TUNING, not the test.

import { test } from "node:test";
import assert from "node:assert/strict";
import { suggest } from "./index.ts";
import { buildHistory, type HistoryMeal } from "./history.ts";
import { acceptanceInBand, type SuggestionOutcome } from "./outcomes.ts";
import type { Category, MealType, TrayEntry } from "./types.ts";

/** Deterministic PRNG — no Math.random, so a failure is always reproducible. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The ground truth: how often this person ACTUALLY wants each food at lunch.
 *  The engine never sees these numbers — only meals sampled from them. */
const TRUTH: { foodId: string; category: Category; p: number }[] = [
  { foodId: "nasi-putih", category: "carb", p: 0.92 },
  { foodId: "ayam-goreng", category: "protein", p: 0.85 },
  { foodId: "capcay", category: "vegetable", p: 0.62 },
  { foodId: "kopi-susu", category: "drink", p: 0.45 },
  { foodId: "sambal", category: "extra", p: 0.30 },
];

const TODAY = "2026-07-28";
const AT = new Date("2026-07-28T12:30:00Z");

function dayAgo(n: number): string {
  return new Date(Date.parse(`${TODAY}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);
}

test("confidence tracks how often the food is actually wanted", () => {
  const rnd = mulberry32(20260728);

  // 1 · Generate 80 lunches from the ground-truth process.
  const meals: HistoryMeal[] = [];
  for (let d = 1; d <= 80; d++) {
    const foods = TRUTH.filter((t) => rnd() < t.p).map((t) => ({
      foodId: t.foodId,
      category: t.category,
      grams: 150,
    }));
    if (foods.length === 0) continue;
    meals.push({ date: dayAgo(d), mealType: "lunch" as MealType, foods });
  }
  const history = buildHistory(meals, TODAY);

  // 2 · Replay: build a partial tray, ask the engine, and let the simulated
  //     user answer from their TRUE propensity — never from the engine's score.
  const outcomes: SuggestionOutcome[] = [];
  for (let trial = 0; trial < 4000; trial++) {
    // The label: what this person wants in THIS meal.
    const wanted = new Set(TRUTH.filter((t) => rnd() < t.p).map((t) => t.foodId));

    // The tray is drawn INDEPENDENTLY of the label. Sampling it from `wanted`
    // instead would mean "not on the tray" correlates with "not wanted", and
    // the engine would be graded on P(wanted | not yet logged) while it
    // predicts P(wanted) — a selection effect that looks like miscalibration
    // but is an artefact of the experiment.
    const shown = TRUTH.filter((t) => rnd() < 0.4).map((t) => t.foodId);
    if (shown.length === 0) continue;

    const tray: TrayEntry[] = shown.map((foodId) => {
      const t = TRUTH.find((x) => x.foodId === foodId)!;
      return {
        foodId,
        category: t.category,
        macros: { kcal: 200, protein: 12, carbs: 20, fat: 6 },
      };
    });

    const out = suggest({
      tray,
      mealType: "lunch",
      at: AT,
      targets: { kcal: 2200, protein: 175 },
      consumedToday: { kcal: 400, protein: 25, carbs: 40, fat: 12 },
      history,
      declined: [],
    });

    for (const s of out) {
      outcomes.push({
        foodId: s.foodId,
        mealType: "lunch",
        confidence: s.confidence,
        reason: s.reason,
        signals: s.signals,
        // The label: did this person actually want it in this meal?
        action: wanted.has(s.foodId) ? "accept" : "decline",
        at: Date.parse(`${TODAY}T12:30:00Z`),
      });
    }
  }

  assert.ok(outcomes.length > 200, `only ${outcomes.length} outcomes — fixture too thin`);

  // 3 · Every populated band must roughly match its own claim. A band is
  //     allowed ±15 points of slack; beyond that the number on screen is a
  //     lie, however good it looks.
  const bands: [number, number][] = [
    [0.35, 0.5],
    [0.5, 0.65],
    [0.65, 0.8],
    [0.8, 0.9],
    [0.9, 1.0],
  ];
  const report: string[] = [];
  let checked = 0;
  for (const [lo, hi] of bands) {
    const got = acceptanceInBand(outcomes, lo, hi, 30);
    if (!got) continue;
    checked++;
    const mid = (lo + Math.min(hi, 0.95)) / 2;
    report.push(`${lo}–${hi}: claimed ~${mid.toFixed(2)}, accepted ${got.rate.toFixed(2)} (n=${got.n})`);
    assert.ok(
      Math.abs(got.rate - mid) <= 0.15,
      `band ${lo}–${hi} is miscalibrated: claimed ~${mid.toFixed(2)}, ` +
        `accepted ${got.rate.toFixed(2)} over ${got.n} outcomes. ` +
        `Retune TUNING, not this test.\n  ${report.join("\n  ")}`
    );
  }
  assert.ok(checked >= 2, `only ${checked} bands had enough samples:\n  ${report.join("\n  ")}`);
});

test("acceptanceInBand refuses to answer on thin evidence", () => {
  const few: SuggestionOutcome[] = Array.from({ length: 5 }, () => ({
    foodId: "x",
    mealType: "lunch" as MealType,
    confidence: 0.85,
    reason: "MEAL_ROUTINE" as const,
    signals: ["S4"],
    action: "accept" as const,
    at: 0,
  }));
  // Five outcomes can read 100% and mean nothing.
  assert.equal(acceptanceInBand(few, 0.8, 0.9, 20), null);
  const many = Array.from({ length: 40 }, (_, i) => ({ ...few[0], action: i < 34 ? ("accept" as const) : ("decline" as const) }));
  const got = acceptanceInBand(many, 0.8, 0.9, 20);
  assert.ok(got);
  assert.equal(got.n, 40);
  assert.ok(Math.abs(got.rate - 0.85) < 0.01);
});
