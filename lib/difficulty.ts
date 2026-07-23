"use client";

// Beginner-safety: a small, derived flag for the handful of lifts that really
// need a coach (free-weight compounds), plus a silent skill-level inference.
// Everything else — every machine and cable — is the safe default, unmarked.
// No data-array mutation, no stored field: level is inferred from history.

import type { StrengthLevel } from "./standards";
import { getAllWorkouts } from "./workouts";

export type Tier = StrengthLevel;

// Coach-required, keyed by BOTH the exercise NAME (these live only in SESSIONS,
// not EQUIPMENT) and the one barbell-bench equipment id. Kept deliberately tiny.
const COACH = new Set<string>([
  "Squat",
  "Deadlift",
  "Romanian Deadlift",
  "Bench Press",
  "Bulgarian Split Squat",
  "flat-bench-press",
]);

/** Does this exercise (by name) or machine (by id) need a coach / spotter? */
export function needsCoach(idOrName: string): boolean {
  return COACH.has(idOrName);
}

/** A safe machine swap for each coach-required lift — real MACHINE ids, curated
 *  (NOT ALTERNATIVES[0], which returns barbell variants like Trap Bar Deadlift). */
export const SAFE_SWAP: Record<string, string> = {
  "Romanian Deadlift": "seated-leg-curl",
  Squat: "leg-press-machine",
  Deadlift: "back-extension-machine",
  "Bench Press": "chest-press-machine",
  "Bulgarian Split Squat": "leg-press-machine",
  "flat-bench-press": "chest-press-machine",
};

/** Silent skill level from how many workouts the user has completed. Defaults to
 *  beginner until proven — no first-visit quiz. */
export function inferLevel(): StrengthLevel {
  const done = getAllWorkouts().filter((w) => w.completed).length;
  if (done < 8) return "beginner";
  if (done < 25) return "intermediate";
  return "advanced";
}
