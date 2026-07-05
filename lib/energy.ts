// Sex-aware energy & macro engine (Mifflin-St Jeor → TDEE → goal → macros).
// Pure functions — no browser/DB deps — so they're unit-testable and safe to
// import anywhere (client or server).

import type { Sex, Goal, MacroTarget } from "./settings";

export const CALORIE_FLOOR = 1400; // hard floor — never program below this
export const PROTEIN_PER_KG = 1.8; // 1.6–2.0 g/kg band, same for both sexes
export const FAT_MIN_PER_KG = 0.8; // hormonal-health fat floor
export const FIBER_TARGET_G = 25;

/** Mifflin-St Jeor basal metabolic rate (kcal/day). */
export function mifflinBMR(sex: Sex, kg: number, cm: number, age: number): number {
  const base = 10 * kg + 6.25 * cm - 5 * age;
  return sex === "female" ? base - 161 : base + 5;
}

/** Total daily energy expenditure = BMR × activity multiplier. */
export function tdee(bmr: number, activity: number): number {
  return bmr * activity;
}

/** kcal delta applied to TDEE for each goal. Fat loss / recomp are deficits;
 *  muscle gain is a lean surplus; maintain is neutral. */
export function goalDelta(goal: Goal): number {
  switch (goal) {
    case "fat_loss":
      return -375; // 300–400 kcal deficit band
    case "recomp":
      return -300;
    case "muscle_gain":
      return 250;
    case "maintain":
    default:
      return 0;
  }
}

export type EnergyInput = {
  sex: Sex;
  goal: Goal;
  weightKg: number;
  heightCm: number;
  age: number;
  activity: number;
};

export type EnergyResult = {
  bmr: number;
  tdee: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  /** True when the calorie floor clamped the target. */
  flooredCalories: boolean;
  /** True when the fat floor lifted fat above the 25%-kcal default. */
  flooredFat: boolean;
  warnings: string[];
};

/** Full target computation with the calorie + fat-hormone floors enforced. */
export function computeTargets(input: EnergyInput): EnergyResult {
  const warnings: string[] = [];
  const bmr = mifflinBMR(input.sex, input.weightKg, input.heightCm, input.age);
  const tde = tdee(bmr, input.activity);

  let kcal = Math.round(tde + goalDelta(input.goal));
  let flooredCalories = false;
  if (kcal < CALORIE_FLOOR) {
    kcal = CALORIE_FLOOR;
    flooredCalories = true;
    warnings.push(
      `Target dinaikkan ke batas aman ${CALORIE_FLOOR} kkal — jangan makan di bawah ini.`
    );
  }

  const protein = Math.round(PROTEIN_PER_KG * input.weightKg);

  // Fat: default ~25% of kcal, but never below the hormonal floor (0.8 g/kg).
  const fatFloorG = Math.round(FAT_MIN_PER_KG * input.weightKg);
  let fat = Math.round((kcal * 0.25) / 9);
  let flooredFat = false;
  if (fat < fatFloorG) {
    fat = fatFloorG;
    flooredFat = true;
    if (input.sex === "female") {
      warnings.push(`Lemak dijaga ≥ ${fatFloorG}g — penting buat hormon.`);
    }
  }

  // Carbs = remaining kcal after protein + fat.
  const remainderKcal = kcal - protein * 4 - fat * 9;
  const carbs = Math.max(0, Math.round(remainderKcal / 4));

  return {
    bmr: Math.round(bmr),
    tdee: Math.round(tde),
    kcal,
    protein,
    carbs,
    fat,
    fiber: FIBER_TARGET_G,
    flooredCalories,
    flooredFat,
    warnings,
  };
}

/** Derive gym-day / rest-day macro targets from a single computed base.
 *  Rest day trims ~300 kcal off carbs (protein + fat held constant), keeping
 *  the calorie floor. Mirrors the app's existing gymDay/restDay carb-cycle. */
export function computeDayTargets(input: EnergyInput): {
  gymDay: MacroTarget;
  restDay: MacroTarget;
  fiber: number;
  warnings: string[];
} {
  const base = computeTargets(input);
  const gymDay: MacroTarget = {
    kcal: base.kcal,
    protein: base.protein,
    carbs: base.carbs,
    fat: base.fat,
  };
  const restKcal = Math.max(CALORIE_FLOOR, base.kcal - 300);
  const restCarbs = Math.max(
    0,
    Math.round((restKcal - base.protein * 4 - base.fat * 9) / 4)
  );
  const restDay: MacroTarget = {
    kcal: restKcal,
    protein: base.protein,
    carbs: restCarbs,
    fat: base.fat,
  };
  return { gymDay, restDay, fiber: base.fiber, warnings: base.warnings };
}
