// MUNGKIN KELUPAAN — the meal-suggestion engine.
//
// One export. The UI calls suggest() and renders what comes back; it never
// reaches inside. That's what makes this replaceable later by something
// learned without touching a line of the builder.
//
// Everything here is pure: no network, no LLM, no storage, and no reading of
// the clock (time arrives via input.at). Given the same input it returns the
// same output, which is the only reason the tests can be trusted.

import { SIGNALS, coldStartCandidates, COLD_START_CATEGORIES } from "./signals.ts";
import { TUNING } from "./tuning.ts";
import type { Candidate, Category, Suggestion, SuggestInput } from "./types.ts";

export { TUNING } from "./tuning.ts";
export { buildHistory, type HistoryMeal } from "./history.ts";
export * from "./types.ts";

/** Noisy-or. Two weak signals shouldn't out-shout one strong one, and no
 *  amount of piling on may reach 1. */
function noisyOr(scores: number[]): number {
  return 1 - scores.reduce((acc, s) => acc * (1 - Math.max(0, Math.min(1, s))), 1);
}

/**
 * Combine one food's candidates.
 *
 * Noisy-or assumes each score is INDEPENDENT evidence. Four of the seven
 * signals aren't: co-occurrence, missing-category, meal-routine and streak are
 * all different views of one number — how often this person eats this thing.
 * Multiplying them together turned a 62%-of-the-time vegetable into "83%
 * yakin", which the calibration test correctly rejected.
 *
 * So: take the strongest score WITHIN each evidence family, then noisy-or
 * ACROSS families. Agreement inside a family adds no information; agreement
 * between "you always eat this" and "you're short on protein" genuinely does.
 */
function combine(list: Candidate[]): number {
  const best = new Map<string, number>();
  for (const c of list) {
    const fam = c.family ?? c.signal;
    best.set(fam, Math.max(best.get(fam) ?? 0, c.score));
  }
  return noisyOr([...best.values()]);
}

/** Dismissals recorded for this exact food at this exact meal. */
function dismissalsFor(input: SuggestInput, foodId: string): number {
  return input.dismissals?.get(`${foodId}|${input.mealType}`) ?? 0;
}

/** Would adding this food push the day meaningfully past its calorie target? */
function overshoots(input: SuggestInput, foodId: string): boolean {
  const median = input.history.medianPortion.get(foodId);
  if (!median) return false;
  const inTrayKcal = input.tray.reduce((a, t) => a + t.macros.kcal, 0);
  const projected = input.consumedToday.kcal + inTrayKcal;
  // Without per-food macros here, use the portion as a proxy at a nominal
  // 1.5 kcal/g — enough to catch "you're already over and this is a big plate"
  // without pretending to a precision we don't have.
  const rough = median * 1.5;
  const ceiling = input.targets.kcal * (1 + TUNING.KCAL_OVERSHOOT_PCT);
  return projected + rough > ceiling;
}

export function suggest(input: SuggestInput): Suggestion[] {
  // "Mungkin kelupaan" means "you might have forgotten" — before anything is
  // on the plate there is nothing to have forgotten, and a strip of guesses
  // over an empty tray is just the app talking to itself.
  if (input.tray.length === 0) return [];

  const cold = input.history.totalMeals < TUNING.COLD_START_MEALS;
  const candidates: Candidate[] = cold
    ? coldStartCandidates(input)
    // Stamp each candidate with its signal's family so the merge can tell
    // independent evidence from four views of the same fact.
    : SIGNALS.flatMap((sig) => sig.run(input).map((c) => ({ ...c, family: sig.family })));

  if (candidates.length === 0) return [];

  const inTray = new Set(input.tray.map((t) => t.foodId));
  const declined = new Set(input.declined);

  // 1 · group by food
  const byFood = new Map<string, Candidate[]>();
  for (const c of candidates) {
    // 3a · hard drops, applied before any arithmetic
    if (inTray.has(c.foodId)) continue;
    if (declined.has(c.foodId)) continue;
    if (dismissalsFor(input, c.foodId) >= TUNING.DISMISS_HARD_BLOCK) continue;
    const list = byFood.get(c.foodId);
    if (list) list.push(c);
    else byFood.set(c.foodId, [c]);
  }

  const scored: Suggestion[] = [];
  for (const [foodId, list] of byFood) {
    // 2 · noisy-or
    let confidence = combine(list);

    // 3b · soft penalties, multiplicative
    const dismissed = dismissalsFor(input, foodId);
    if (dismissed > 0) confidence *= TUNING.DISMISS_SOFT_PENALTY;
    if (overshoots(input, foodId)) confidence *= TUNING.KCAL_OVERSHOOT_PENALTY;

    // 4 · cap. Never 100% — it reads as a promise.
    confidence = Math.min(TUNING.MAX_CONFIDENCE, confidence);
    if (cold) confidence = Math.min(TUNING.COLD_START_MAX_CONF, confidence);

    // The reason shown is the one from the strongest single signal, so the
    // copy matches why it actually surfaced.
    const best = list.reduce((a, b) => (b.score > a.score ? b : a));
    scored.push({
      foodId,
      confidence,
      reason: best.reason,
      reasonParams: best.reasonParams,
      // Sorted so the output is stable regardless of signal execution order.
      signals: [...new Set(list.map((c) => c.signal))].sort(),
    });
  }

  // 5 · rank. Ties break on foodId so the same input always gives the same
  // order — the UI shows these as a list and it must not shuffle.
  scored.sort((a, b) => b.confidence - a.confidence || a.foodId.localeCompare(b.foodId));

  // 6 · diversity: one per category, so the strip never becomes three rices.
  const categoryOf = (id: string): Category =>
    input.history.categoryOf.get(id) ?? COLD_START_CATEGORIES.get(id) ?? "extra";
  const seen = new Set<Category>();
  const diverse: Suggestion[] = [];
  for (const s of scored) {
    const c = categoryOf(s.foodId);
    if (seen.has(c)) continue;
    seen.add(c);
    diverse.push(s);
  }

  // 7 · floor and ceiling. Returning 0 or 1 is normal — the strip hides itself.
  const limit = cold ? TUNING.COLD_START_MAX_ITEMS : TUNING.MAX_SUGGESTIONS;
  return diverse.filter((s) => s.confidence >= TUNING.MIN_CONFIDENCE).slice(0, limit);
}
