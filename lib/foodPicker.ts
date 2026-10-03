import type { Family, Leaf, Picks } from "./foodFamilies.ts";
import { NONE } from "./foodFamilies.ts";
import { applyPick, canonicalLeaf, facetRows, leavesFor, picksOf } from "./foodTiles.ts";
import type { Predictor } from "./foodPredict.ts";
import type { SearchableFood } from "./foodSearch.ts";

export type PickerChoice<T> = { leaf: Leaf<T>; picks: Picks };

/** A complete, valid usual choice. Only confirmation teaches the predictor. */
export function openingChoice<T extends SearchableFood>(family: Family<T>, predictor: Predictor): PickerChoice<T> | null {
  const ranked = predictor.orderLeaves(family.leaves);
  if (ranked.length === 0) return null;
  const usual = ranked.find((l) => predictor.foodEvidence(l.food.id) > 0);
  if (usual) return { leaf: usual, picks: picksOf(family, usual) };

  // Curated, existing staples make better cold starts than the biggest variety
  // bucket (which opened Nasi on kuning). Fall through if a row is unavailable.
  const defaults: Record<string, string> = { nasi: "white-rice", ayam: "ayam-goreng", telur: "egg" };
  const staple = ranked.find((l) => l.food.id === defaults[family.base]);
  if (staple) return { leaf: staple, picks: picksOf(family, staple) };

  // Cold start: choose a common preparation, then its plain catalogue row.
  let picks: Picks = {};
  const first = facetRows(family, picks)[0];
  if (first) {
    const options = predictor.orderOptions(family, first.axis, first.options, picks);
    const top = options.find((o) => o.value !== NONE) ?? options[0];
    if (top) picks = applyPick(family, picks, first.axis, top.value);
  }
  const leaf = canonicalLeaf(family, picks) ?? predictor.orderLeaves(leavesFor(family, picks))[0] ?? ranked[0];
  return { leaf, picks: picksOf(family, leaf) };
}

/** Retain row positions while changing filters. New options append once. */
export function stableOptionOrder<T>(options: readonly T[], previous: readonly string[], id: (option: T) => string): { options: T[]; order: string[] } {
  const order = [...previous];
  for (const o of options) if (!order.includes(id(o))) order.push(id(o));
  const ranks = new Map(order.map((key, i) => [key, i]));
  return { options: [...options].sort((a, b) => ranks.get(id(a))! - ranks.get(id(b))!), order };
}
