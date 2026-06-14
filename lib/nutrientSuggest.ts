"use client";

import { INGREDIENTS, type Ingredient } from "./ingredients";
import { MICROS, type MicroProfile } from "./micronutrients";
import type { MicroKey } from "./nutritionTargets";

export type SuggestionKey = "protein" | "fiber" | "omega3" | "k" | "mg" | "fe" | "zn" | "ca";

export type Suggestion = {
  id: string;
  name: string;
  unit: string;
  /** Suggested quantity in the ingredient's native unit (e.g. 2 = "2× egg",
   *  0.5 = "½ scoop oats"). Always rounded sensibly for the UI. */
  qty: number;
  /** What this portion contributes toward the gap, in the nutrient's unit. */
  contributes: number;
};

/** Per-unit value of a given nutrient on an ingredient. Pulls from MICROS
 *  for extended nutrients, and from the ingredient itself for protein. */
function unitValue(ing: Ingredient, key: SuggestionKey): number {
  if (key === "protein") return ing.protein;
  const m: MicroProfile | undefined = MICROS[ing.id];
  if (!m) return 0;
  const v = m[key as keyof MicroProfile];
  return typeof v === "number" ? v : 0;
}

/** Density-per-kcal — favours nutrient-dense foods over calorie-bombs.
 *  e.g. broccoli wins for K over banana per-kcal, even though banana is
 *  higher per-unit absolutely. Kcal floor of 5 to avoid div-by-zero on
 *  zero-cal supplements. */
function densityPerKcal(ing: Ingredient, key: SuggestionKey): number {
  const v = unitValue(ing, key);
  if (v <= 0) return 0;
  return v / Math.max(5, ing.kcal);
}

/** Sensible UI rounding for the suggested qty. Whole eggs/bananas round
 *  up to nearest int; per-100g items round to nearest 0.5; everything
 *  else rounds to one decimal. */
function roundQty(ing: Ingredient, qty: number): number {
  // Whole-unit foods — never suggest "1.7 eggs".
  const wholeUnits = /^1 (egg|breast|thigh|slice|bar|whole|cup|piece|sandwich|pack|bowl)|^\d+ (eggs|breast|piece|wonton|dumpling)/i;
  if (wholeUnits.test(ing.unit)) return Math.max(1, Math.ceil(qty));
  // Half-step foods (scoops, half-pack veg, halves)
  if (ing.step === 0.5) return Math.max(0.5, Math.round(qty * 2) / 2);
  // Default: 1 decimal
  return Math.max(0.1, Math.round(qty * 10) / 10);
}

/** Foods that don't belong in a "what to eat next" suggestion: sauces,
 *  drinks that contribute little nutritionally on their own, placeholders. */
const SUGGESTION_BLACKLIST = new Set<string>([
  "soy-sauce", "low-soy-sauce", "oyster-sauce", "sukiyaki-sauce", "gyudon-sauce",
  "black-pepper", "garlic-powder", "lemon-juice", "water", "black-coffee",
  "creatine", "small-chocolate",
]);

/** Rank the top-3 ingredients to close a specific nutrient gap. Returns
 *  the suggested qty that would close ≥ the gap (clamped to a reasonable
 *  portion of the gap so suggestions feel "snackable", not absurd). */
export function suggestForNutrient(
  key: SuggestionKey,
  gap: number,
  opts: { limit?: number; excludeIds?: Set<string> } = {}
): Suggestion[] {
  if (gap <= 0) return [];
  const limit = opts.limit ?? 3;
  const exclude = opts.excludeIds ?? new Set<string>();

  const ranked = INGREDIENTS
    .filter((ing) => !SUGGESTION_BLACKLIST.has(ing.id))
    .filter((ing) => !exclude.has(ing.id))
    .map((ing) => ({
      ing,
      perUnit: unitValue(ing, key),
      density: densityPerKcal(ing, key),
    }))
    .filter((x) => x.perUnit > 0 && x.density > 0)
    .sort((a, b) => b.density - a.density)
    .slice(0, 30); // wide net before qty-rounding cuts duplicates

  const out: Suggestion[] = [];
  const seenName = new Set<string>();
  for (const { ing, perUnit } of ranked) {
    if (seenName.has(ing.name)) continue;
    // How many units to cover the WHOLE gap, capped at a sensible portion.
    const rawQty = Math.min(gap / perUnit, 4);
    const qty = roundQty(ing, rawQty);
    const contributes = Math.round(qty * perUnit * 10) / 10;
    if (contributes <= 0) continue;
    out.push({
      id: ing.id,
      name: ing.name,
      unit: ing.unit,
      qty,
      contributes,
    });
    seenName.add(ing.name);
    if (out.length >= limit) break;
  }
  return out;
}

/** Map the report-row key to the suggestion-engine key (mostly identity). */
export function suggestKeyForRow(rowKey: string): SuggestionKey | null {
  if (rowKey === "protein" || rowKey === "fiber" || rowKey === "omega3") return rowKey;
  if (rowKey === "k" || rowKey === "mg" || rowKey === "fe" || rowKey === "zn" || rowKey === "ca") {
    return rowKey;
  }
  return null;
}

export type _MicroKey = MicroKey;
