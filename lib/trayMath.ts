// The arithmetic of "how much of this did I eat", in one pure place.
//
// This used to live inline in FoodBuilder.tsx, in four places that each did it
// slightly differently, and no test could reach any of them. An audit of the
// builder found the consequences, and every one is a calorie number that was
// wrong while looking right:
//
//   · "Noodle soup" opened at 950 kkal. Its stored macros describe ONE BOWL (380),
//     but with no gram weight to anchor them the code fell back to 100 g per unit,
//     then opened the sheet at a name-guessed 250 g — 2.5 bowls. The same
//     mistake priced es teh manis ×3, caffe latte ×2.5, and eleven more of the
//     141 curated staples.
//   · TAMBAHAN add-ons (extra sambal, "tanpa gula") moved the number on the
//     sheet and then vanished: they were not in the tray total and not in what
//     SIMPAN saved. The tray could say 250 kkal while the log said 205.
//   · Foods with no gram basis were saved with `grams: qty` — "4 g" of soto.
//
// THE MODEL. Every food stores its macros for ONE stored unit. What that unit
// weighs is `gramBasis` when the data says so (a DB row's 100 g, a "1 bowl
// (300g)" label) and UNKNOWN otherwise. Unknown must stay unknown: pretending a
// bowl is 100 g is how 380 became 950. For those foods the honest portion is a
// count of units — ¼, ½, 1, 2 bowls — and grams are not shown at all.

import { gramsFromUnit } from "./satuan.ts";
import { modDelta } from "./foodMods.ts";

export type FoodLike = {
  name?: string | null;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  sugar?: number | null;
  unit?: string | null;
  gramsPerUnit?: number | null;
};

export type Macros = { kcal: number; protein: number; carbs: number; fat: number };

/** What one stored unit weighs, if the data actually says. Null = unknown. */
export function gramBasis(f: Pick<FoodLike, "unit" | "gramsPerUnit">): number | null {
  if (f.gramsPerUnit && f.gramsPerUnit > 0) return f.gramsPerUnit;
  return gramsFromUnit(f.unit);
}

/**
 * How a food is portioned.
 *   "grams" — the data knows what a unit weighs; portion in grams, anchored on
 *             the food's own serving.
 *   "units" — it does not; portion as a multiple of one stored unit, and never
 *             show a weight we made up.
 */
export type PortionModel =
  | { mode: "grams"; unitG: number; defaultG: number }
  | { mode: "units"; unitG: 100; defaultG: 100 };

export function portionModel(
  food: Pick<FoodLike, "unit" | "gramsPerUnit">,
  /** The sheet's default serving in grams — satuanFor(food).portionG. */
  suggestedG: number
): PortionModel {
  const basis = gramBasis(food);
  if (basis === null) return { mode: "units", unitG: 100, defaultG: 100 }; // 1 unit, by construction
  return { mode: "grams", unitG: basis, defaultG: suggestedG > 0 ? suggestedG : basis };
}

/** Multiplier of one stored unit for a given number of grams. */
export function qtyFromGrams(unitG: number, grams: number): number {
  if (!(unitG > 0) || !(grams > 0)) return 0;
  return Math.round((grams / unitG) * 1000) / 1000;
}

export const gramsFromQty = (unitG: number, qty: number): number => qty * unitG;

/** The macros of `qty` stored units plus the flat add-on deltas. Add-ons are
 *  per ENTRY, not per unit: extra sambal is one spoon whether it is half a
 *  plate or three. Floors at zero — "tanpa nasi" cannot make a negative meal. */
export function itemMacros(food: FoodLike, qty: number, mods: readonly string[] = []): Macros {
  const d = modDelta(mods);
  return {
    kcal: Math.max(0, food.kcal * qty + d.kcal),
    protein: Math.max(0, food.protein * qty + d.p),
    carbs: Math.max(0, food.carbs * qty + d.c),
    fat: Math.max(0, food.fat * qty + d.f),
  };
}

export type TrayEntry = { food: FoodLike; qty: number; mods?: readonly string[] };

/** Sum of a tray. The single source for the number on the SIMPAN button AND
 *  for what gets saved, so the two cannot disagree again. */
export function trayTotals(entries: readonly TrayEntry[]): Macros {
  const t: Macros = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  for (const e of entries) {
    if (!(e.qty > 0)) continue;
    const m = itemMacros(e.food, e.qty, e.mods ?? []);
    t.kcal += m.kcal;
    t.protein += m.protein;
    t.carbs += m.carbs;
    t.fat += m.fat;
  }
  return t;
}

/** Grams to RECORD for a saved item, or 0 when the weight is unknown. MealHome
 *  shows "1 porsi" for 0, which is honest; "4 g" of soto was not. */
export function gramsToSave(food: Pick<FoodLike, "unit" | "gramsPerUnit">, qty: number): number {
  const basis = gramBasis(food);
  return basis === null ? 0 : Math.round(basis * qty);
}
