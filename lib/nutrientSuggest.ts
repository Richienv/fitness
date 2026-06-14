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

// ============================================================
// MULTI-NUTRIENT TOP-UP — the "what one food closes the most gaps" picker
// ============================================================

export type Gap = {
  key: SuggestionKey;
  /** Remaining gap in the nutrient's own unit (g for protein/fiber/omega3,
   *  mg for minerals). Always positive — already-maxed nutrients omitted. */
  gap: number;
  /** Daily target (for normalising fractional closure across units). */
  target: number;
};

export type TopUp = {
  id: string;
  name: string;
  unit: string;
  /** Suggested qty in the ingredient's native units. */
  qty: number;
  /** Calorie cost for that portion. */
  kcal: number;
  /** Per-nutrient contribution at this qty: gap-fraction (0..1) per gap. */
  contributions: Array<{ key: SuggestionKey; closes: number; pctOfTarget: number }>;
  /** Sum of pctOfTarget across the unmet gaps — the "spread" score. */
  totalClose: number;
  /** Number of different unmet nutrients this food contributes meaningfully to (>=5% of target). */
  hitsMultiple: number;
};

/**
 * Rank library foods by how well a SINGLE serving closes ALL unmet gaps at
 * once. Score = sum over each gap of min(perUnitValue × qty, gap) / target,
 * normalised by calories so we don't keep suggesting calorie bombs.
 *
 * The qty is picked per-food so it caps at the biggest fractional close —
 * eating more than that doesn't help the gaps and just adds kcal.
 *
 * "hitsMultiple" lets the UI label a food as a "synergy pick" when one
 * portion closes ≥3 different gaps at once.
 */
export function bestTopUps(gaps: Gap[], opts: { limit?: number } = {}): TopUp[] {
  if (gaps.length === 0) return [];
  const limit = opts.limit ?? 3;

  const candidates: TopUp[] = [];
  for (const ing of INGREDIENTS) {
    if (SUGGESTION_BLACKLIST.has(ing.id)) continue;

    // Per-unit value for each gap.
    const perUnit: Array<{ key: SuggestionKey; perUnit: number; gap: number; target: number }> = [];
    let anyContribution = false;
    for (const g of gaps) {
      const v = unitValue(ing, g.key);
      if (v > 0) anyContribution = true;
      perUnit.push({ key: g.key, perUnit: v, gap: g.gap, target: g.target });
    }
    if (!anyContribution) continue;

    // Choose the qty: the smallest qty that maxes out the most-pressing
    // gap (clamped to a reasonable 3-portion ceiling).
    const qtyForFullClose: number[] = [];
    for (const p of perUnit) {
      if (p.perUnit > 0) qtyForFullClose.push(p.gap / p.perUnit);
    }
    if (qtyForFullClose.length === 0) continue;
    // Use the median — close most gaps without grossly overshooting any.
    qtyForFullClose.sort((a, b) => a - b);
    const median = qtyForFullClose[Math.floor(qtyForFullClose.length / 2)];
    const rawQty = Math.min(median, 3);
    const qty = roundQty(ing, rawQty);
    if (qty <= 0) continue;

    let totalClose = 0;
    let hitsMultiple = 0;
    const contributions: TopUp["contributions"] = [];
    for (const p of perUnit) {
      const delivered = qty * p.perUnit;
      const closes = Math.min(delivered, p.gap);
      const pctOfTarget = p.target > 0 ? closes / p.target : 0;
      if (pctOfTarget > 0) {
        contributions.push({ key: p.key, closes, pctOfTarget });
        totalClose += pctOfTarget;
        if (pctOfTarget >= 0.05) hitsMultiple++;
      }
    }
    if (totalClose <= 0) continue;

    candidates.push({
      id: ing.id,
      name: ing.name,
      unit: ing.unit,
      qty,
      kcal: Math.round(ing.kcal * qty),
      contributions,
      totalClose,
      hitsMultiple,
    });
  }

  // Score: % of target closed per 100 kcal — favours nutrient-density.
  // Synergy bonus: foods that hit ≥3 different gaps get a 1.4× multiplier.
  const scored = candidates.map((c) => {
    const perKcal = c.totalClose / Math.max(0.1, c.kcal / 100);
    const synergy = c.hitsMultiple >= 3 ? 1.4 : c.hitsMultiple >= 2 ? 1.15 : 1;
    return { c, score: perKcal * synergy };
  });
  scored.sort((a, b) => b.score - a.score);

  // De-dupe by name (e.g. "Greek yogurt" appears twice in the library).
  const seen = new Set<string>();
  const out: TopUp[] = [];
  for (const { c } of scored) {
    if (seen.has(c.name)) continue;
    seen.add(c.name);
    out.push(c);
    if (out.length >= limit) break;
  }
  return out;
}
