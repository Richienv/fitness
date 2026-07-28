// Every ✓ and ✕ is a label. This records them.
//
// Two jobs:
//   · dismissal counts, which feed the penalties in the ranker — a food you
//     keep waving away for dinner should stop asking.
//   · a rolling log of outcomes, which is the fixture for calibration tests
//     and the training set if this ever becomes a learned model.
//
// Local-first and per-user via scopedKey, like the rest of the app. Nothing
// here is called from inside suggest() — that has a 16 ms budget and must not
// touch storage.

import { scopedKey } from "../userScope.ts";
import { TUNING } from "./tuning.ts";
import type { MealType, ReasonCode } from "./types.ts";

const OUTCOMES_KEY = "richie.suggest.outcomes.v1";

export type SuggestionOutcome = {
  foodId: string;
  mealType: MealType;
  /** What the engine claimed at the time. Needed to check calibration later. */
  confidence: number;
  reason: ReasonCode;
  signals: string[];
  action: "accept" | "decline";
  /** Epoch ms. */
  at: number;
};

function read(): SuggestionOutcome[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(scopedKey(OUTCOMES_KEY));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as SuggestionOutcome[]) : [];
  } catch {
    return [];
  }
}

function write(list: SuggestionOutcome[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(scopedKey(OUTCOMES_KEY), JSON.stringify(list));
  } catch {
    /* quota — dropping telemetry is always better than breaking logging */
  }
}

export function getOutcomes(): SuggestionOutcome[] {
  return read();
}

/** Record one answer. Keeps only the most recent OUTCOME_LOG_MAX. */
export function logSuggestionOutcome(o: SuggestionOutcome): void {
  const list = read();
  list.push(o);
  write(list.slice(-TUNING.OUTCOME_LOG_MAX));
}

/**
 * Dismissal counts keyed `${foodId}|${mealType}`, which is exactly the shape
 * the ranker's penalties expect.
 *
 * Only declines inside the dismissal window count: a "no" from three months
 * ago shouldn't silence a food forever, because tastes change.
 */
export function dismissalCounts(now: number = Date.now()): Map<string, number> {
  const cutoff = now - TUNING.DISMISS_WINDOW_DAYS * 86_400_000;
  const counts = new Map<string, number>();
  for (const o of read()) {
    if (o.action !== "decline") continue;
    if (o.at < cutoff) continue;
    const k = `${o.foodId}|${o.mealType}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return counts;
}

/**
 * Observed acceptance rate inside a confidence band — the measurement behind
 * the calibration test.
 *
 * Returns null when there aren't enough samples to say anything. That matters:
 * a band with three outcomes in it can read 100% or 0% and mean neither.
 */
export function acceptanceInBand(
  outcomes: readonly SuggestionOutcome[],
  lo: number,
  hi: number,
  minSamples = 20
): { rate: number; n: number } | null {
  const inBand = outcomes.filter((o) => o.confidence >= lo && o.confidence < hi);
  if (inBand.length < minSamples) return null;
  const accepted = inBand.filter((o) => o.action === "accept").length;
  return { rate: accepted / inBand.length, n: inBand.length };
}
