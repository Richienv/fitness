import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calibrateAdaptiveTdee,
  calorieFloorFor,
  computeMetabolicSnapshot,
  computeNeatFactor,
  computeTefDeltaKcal,
  FEMALE_CALORIE_FLOOR,
  MALE_CALORIE_FLOOR,
  precisionBmr,
  sanitizeMetabolicProfile,
  type MetabolicHistoryDay,
} from "./metabolicEngine.ts";
import { cycleMetabolicEffect, lutealCalorieAllowance } from "./cycle.ts";

test("calorie floor protects women at 1200 kcal instead of trapping small frames at 1400 kcal", () => {
  assert.equal(FEMALE_CALORIE_FLOOR, 1200);
  assert.equal(MALE_CALORIE_FLOOR, 1500);
  assert.equal(calorieFloorFor("female"), 1200);
  assert.equal(calorieFloorFor("male"), 1500);
});

test("sedentary petite female with 10+ sitting hours gets honest low NEAT burn instead of inflated 1.5x", () => {
  const neat = computeNeatFactor({
    metabolic: {
      sittingHours: "10plus",
      dailyPosture: "desk",
      typicalSteps: "lt3k",
    },
    fallbackActivity: 1.5,
    hasWatchActive: false,
  });
  assert.equal(neat.calibratedLifestyle, true);
  assert.equal(neat.factor, 1.08);

  const snap = computeMetabolicSnapshot({
    sex: "female",
    goal: "fat_loss",
    kg: 46,
    cm: 156,
    age: 23,
    metabolic: {
      sittingHours: "10plus",
      dailyPosture: "desk",
      typicalSteps: "lt3k",
      deficitPace: "gentle",
    },
    activeBurnDay: 0,
    hasWatchActive: false,
    eatenToday: { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  });
  // BMR ≈ 1159, NEAT 1.08 -> ~1252 kcal total burn. Must NOT tell her she burns 1700+!
  assert.ok(snap.totalBurnDay < 1320, `expected <1320 burn, got ${snap.totalBurnDay}`);
  assert.equal(snap.calorieFloor, 1200);
  assert.equal(snap.recommendedTargetKcal, 1200);
  assert.equal(snap.floored, true);
});

test("precisionBmr blends Katch-McArdle lean mass when waist/hip or body fat % is known", () => {
  const plain = precisionBmr({ sex: "male", kg: 80, cm: 178, age: 28 });
  const lean = precisionBmr({
    sex: "male",
    kg: 80,
    cm: 178,
    age: 28,
    metabolic: { bodyFatPct: 12 },
  });
  const higherBf = precisionBmr({
    sex: "male",
    kg: 80,
    cm: 178,
    age: 28,
    metabolic: { bodyFatPct: 32 },
  });
  assert.equal(plain.method, "mifflin");
  assert.equal(lean.method, "katch_blend");
  assert.ok(lean.bmr > higherBf.bmr, "higher lean mass must raise BMR relative to higher body fat at same scale weight");
});

test("high-protein intake increases TEF delta while fat-heavy intake reduces TEF delta", () => {
  const highProtein = computeTefDeltaKcal({
    eatenKcal: 1800,
    proteinG: 160,
    carbsG: 150,
    fatG: 55,
  });
  const lowProtein = computeTefDeltaKcal({
    eatenKcal: 1800,
    proteinG: 45,
    carbsG: 150,
    fatG: 110,
  });
  assert.ok(highProtein > 20, `expected positive TEF delta, got ${highProtein}`);
  assert.ok(lowProtein < 0, `expected negative TEF delta, got ${lowProtein}`);
});

test("luteal PMS cycle boosts RMR +5.5% and explains water retention without triggering false surplus", () => {
  const snap = computeMetabolicSnapshot({
    sex: "female",
    goal: "fat_loss",
    kg: 52,
    cm: 160,
    age: 24,
    metabolic: { sittingHours: "7to9", dailyPosture: "mixed", typicalSteps: "3k_5500", cycleLengthDays: 28 },
    menstrualTrackingEnabled: true,
    cycleStartDate: "2026-11-01",
    date: "2026-11-25", // Day 25 -> late_luteal
    activeBurnDay: 180,
    hasWatchActive: false,
    eatenToday: { kcal: 1200, proteinG: 95, carbsG: 110, fatG: 40 },
  });
  assert.equal(snap.cycleEffect.active, true);
  assert.equal(snap.cycleEffect.subPhase, "late_luteal");
  assert.equal(snap.cycleEffect.excludeFromWeightSlope, true);
  assert.ok(snap.cycleRmrKcal >= 55);
});

test("closed-loop adaptive TDEE detects lower real metabolism after 14 days and adjusts burn down cleanly", () => {
  // Suppose formula thinks baseline burn is 1800 kcal/day, user eats 1600 kcal/day + 200 active,
  // YET scale trend stays completely flat over 14 days -> real total TDEE is ~1600 (300 lower than 2000)!
  const history: MetabolicHistoryDay[] = [];
  for (let i = 0; i < 14; i++) {
    const day = String(i + 1).padStart(2, "0");
    history.push({
      date: `2026-11-${day}`,
      weightKg: i % 2 === 0 ? 60.0 + (i % 4 === 0 ? 0.05 : -0.05) : null,
      eatenKcal: 1600,
      activeKcal: 200,
      formulaBaselineBurn: 1800,
      excludeFromSlope: false,
    });
  }
  const cal = calibrateAdaptiveTdee(history);
  assert.equal(cal.status, "calibrated");
  assert.ok(cal.adaptiveOffsetKcal <= -100, `expected downward offset <= -100, got ${cal.adaptiveOffsetKcal}`);
  assert.equal(cal.realityMismatch, true);
  assert.ok(cal.mismatchMessage);
});

test("adaptive TDEE ignores luteal water spikes when clean follicular/ovulation weigh-ins exist", () => {
  const history: MetabolicHistoryDay[] = [];
  for (let i = 0; i < 14; i++) {
    const day = String(i + 1).padStart(2, "0");
    const isLutealSpike = i >= 10;
    history.push({
      date: `2026-11-${day}`,
      // Clean trajectory drops steadily -0.06 kg/day except fake +1.3kg PMS water spike at the end
      weightKg: isLutealSpike ? 56.5 : 56.0 - i * 0.06,
      eatenKcal: 1400,
      activeKcal: 150,
      formulaBaselineBurn: 1650,
      excludeFromSlope: isLutealSpike,
    });
  }
  const cal = calibrateAdaptiveTdee(history);
  assert.equal(cal.status, "calibrated");
  // Observed TDEE should reflect the true downward tissue slope (~1862), NOT the +1.3 kg water artifact!
  assert.ok((cal.observedTotalTdee ?? 0) > 1650);
});

test("sanitizeMetabolicProfile validates enums and clamps cycle length and body fat", () => {
  const clean = sanitizeMetabolicProfile({
    sittingHours: "7to9",
    dailyPosture: "invalid_value",
    bodyFatPct: 24.44,
    cycleLengthDays: 99,
  });
  assert.deepEqual(clean, {
    sittingHours: "7to9",
    bodyFatPct: 24.4,
    cycleLengthDays: 40,
  });
});

test("cycleMetabolicEffect tracks menstrual, follicular, ovulation, early_luteal and late_luteal phases across variable cycle lengths", () => {
  const start = "2026-11-01";
  const m = cycleMetabolicEffect(start, true, "2026-11-02", 28); // Day 2
  const f = cycleMetabolicEffect(start, true, "2026-11-08", 28); // Day 8
  const o = cycleMetabolicEffect(start, true, "2026-11-14", 28); // Day 14
  const el = cycleMetabolicEffect(start, true, "2026-11-19", 28); // Day 19
  const ll = cycleMetabolicEffect(start, true, "2026-11-26", 28); // Day 26

  assert.equal(m.subPhase, "menstrual");
  assert.equal(m.excludeFromWeightSlope, true);
  assert.equal(f.subPhase, "follicular");
  assert.equal(f.rmrPct, 0);
  assert.equal(o.subPhase, "ovulation");
  assert.equal(o.rmrPct, 0.02);
  assert.equal(el.subPhase, "early_luteal");
  assert.equal(ll.subPhase, "late_luteal");
  assert.equal(ll.rmrPct, 0.055);
  assert.equal(ll.excludeFromWeightSlope, true);
  assert.equal(lutealCalorieAllowance(start, true, "2026-11-26", 28), 150);

  // 32-day cycle shifts ovulation later (~day 16)
  const longCycleDay10 = cycleMetabolicEffect(start, true, "2026-11-10", 32);
  assert.equal(longCycleDay10.subPhase, "follicular");
});
