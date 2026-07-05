// lib/standards.ts — female-adjusted metrics & strength standards
// Pure logic module. No React, no DOM, no DB.

import type { Sex } from "@/lib/settings";

/** Healthy body-fat percentage range per sex. */
export function bodyFatRange(sex: Sex): { min: number; max: number } {
  return sex === "female" ? { min: 21, max: 33 } : { min: 8, max: 20 };
}

/** Classify a body-fat percentage against the healthy range. */
export function bodyFatLabel(
  sex: Sex,
  pct: number,
): "low" | "healthy" | "high" {
  const { min, max } = bodyFatRange(sex);
  if (pct < min) return "low";
  if (pct > max) return "high";
  return "healthy";
}

/** Upper bound of a healthy waist-to-hip ratio per sex. */
export const WHR_HEALTHY_MAX = { female: 0.85, male: 0.95 } as const;

/** Classify a waist-to-hip ratio. */
export function whrLabel(sex: Sex, ratio: number): "healthy" | "watch" {
  return ratio > WHR_HEALTHY_MAX[sex] ? "watch" : "healthy";
}

/** Default daily step goal per sex. */
export function defaultStepGoal(sex: Sex): number {
  return sex === "female" ? 8000 : 10000;
}

export type StrengthLevel = "beginner" | "intermediate" | "advanced";

type StrengthTiers = {
  beginner: number;
  intermediate: number;
  advanced: number;
};

/**
 * Strength standards expressed as multiples of bodyweight (1RM / bodyweight)
 * for a few core lifts, keyed by sex then lift id.
 */
export const STRENGTH_STANDARDS: Record<
  Sex,
  Record<string, StrengthTiers>
> = {
  female: {
    hipThrust: { beginner: 1, intermediate: 1.5, advanced: 2 },
    squat: { beginner: 0.75, intermediate: 1, advanced: 1.5 },
    deadlift: { beginner: 1, intermediate: 1.5, advanced: 2 },
    benchPress: { beginner: 0.4, intermediate: 0.6, advanced: 0.9 },
    ohp: { beginner: 0.3, intermediate: 0.45, advanced: 0.65 },
  },
  male: {
    squat: { beginner: 1, intermediate: 1.5, advanced: 2 },
    deadlift: { beginner: 1.5, intermediate: 2, advanced: 2.5 },
    benchPress: { beginner: 0.75, intermediate: 1.15, advanced: 1.5 },
    ohp: { beginner: 0.55, intermediate: 0.8, advanced: 1.05 },
    hipThrust: { beginner: 1.5, intermediate: 2, advanced: 2.5 },
  },
};

/**
 * Level badge for a lift: highest tier whose bodyweight-multiple threshold is
 * reached by 1RM / bodyweight. "novice" if below beginner or on bad input
 * (unknown lift, non-positive bodyweight/1RM).
 */
export function strengthLevel(
  sex: Sex,
  lift: string,
  oneRepMaxKg: number,
  bodyweightKg: number,
): StrengthLevel | "novice" {
  const tiers = STRENGTH_STANDARDS[sex]?.[lift];
  if (
    !tiers ||
    !Number.isFinite(oneRepMaxKg) ||
    !Number.isFinite(bodyweightKg) ||
    bodyweightKg <= 0 ||
    oneRepMaxKg <= 0
  ) {
    return "novice";
  }
  const ratio = oneRepMaxKg / bodyweightKg;
  if (ratio >= tiers.advanced) return "advanced";
  if (ratio >= tiers.intermediate) return "intermediate";
  if (ratio >= tiers.beginner) return "beginner";
  return "novice";
}
