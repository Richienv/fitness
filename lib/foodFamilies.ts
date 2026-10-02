// Families: the tree the picker walks.
//
//   family "ayam"  (108 rows)
//     ├─ Dimasak:  goreng 31 · bakar 18 · geprek 6 · rebus 4 …
//     ├─ Bagian:   dada · paha · sayap …          (only if the rows have it)
//     └─ leaves:   the real rows, with their real macros
//
// THE RULE EVERYTHING HERE OBEYS: the picker only offers choices that exist.
// An option is a facet value that at least one remaining row actually carries;
// the leaves are rows from the catalogue. There is no "ayam bakar paha" unless
// that row exists, because the alternative — scaling "ayam bakar" by a guessed
// factor and calling it paha — is a made-up calorie number dressed as data, and
// credible macros are the one thing this flow must not trade away for speed.
//
// SKIP-ABLE BY CONSTRUCTION: an axis with fewer than two distinct values among
// the remaining rows is never asked. Asking "which cut?" when every remaining
// row says "dada" is a tap that decides nothing.

import {
  AXIS_ORDER,
  DISH_AXIS_ORDER,
  nameKey,
  parseFood,
  type FacetAxis,
  type Parsed,
} from "./foodFacets.ts";
import type { SearchableFood } from "./foodSearch.ts";

export type Leaf<T> = {
  food: T;
  parsed: Parsed;
  /** Normalised full name, the duplicate-collapse key. */
  key: string;
};

export type Family<T> = {
  /** Normalised base: "ayam". */
  base: string;
  /** How a tile is titled: "Ayam". */
  label: string;
  leaves: Leaf<T>[];
  /** Rows dropped as exact-name duplicates, kept so the UI can be honest that
   *  "Ayam goreng" has more than one source and say how far apart they are. */
  duplicates: Map<string, T[]>;
  /** True when the first word is a dish ("soto", "mie"): the next axis is
   *  what's IN it, not how it was cooked. */
  isDish: boolean;
};

export type FamilyIndex<T> = {
  families: Map<string, Family<T>>;
  /** Rows no family could place — search is the way to reach these. */
  unplaced: Leaf<T>[];
  /** Per-food lookup so a search hit can open its own family. */
  byId: Map<string, { family: string; leaf: Leaf<T> }>;
};

/** Which duplicate to keep: curated staples first, then the more popular row. */
function better<T extends SearchableFood>(a: T, b: T): T {
  const pa = a.popularity ?? 0;
  const pb = b.popularity ?? 0;
  return pb > pa ? b : a;
}

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

export function buildFamilies<T extends SearchableFood>(foods: readonly T[]): FamilyIndex<T> {
  const families = new Map<string, Family<T>>();
  const unplaced: Leaf<T>[] = [];
  const byId: FamilyIndex<T>["byId"] = new Map();

  for (const food of foods) {
    const parsed = parseFood(food.name);
    const leaf: Leaf<T> = { food, parsed, key: nameKey(food.name) };
    if (!parsed.base || parsed.baseKind === "unknown") {
      unplaced.push(leaf);
      continue;
    }
    let fam = families.get(parsed.base);
    if (!fam) {
      fam = {
        base: parsed.base,
        label: cap(parsed.base),
        leaves: [],
        duplicates: new Map(),
        isDish: parsed.baseKind === "dish",
      };
      families.set(parsed.base, fam);
    }
    // A family is a "dish" if ANY of its rows says so — "nasi" is dish-headed
    // even when one row happens to be "Nasi" alone.
    if (parsed.baseKind === "dish") fam.isDish = true;

    const existing = fam.leaves.findIndex((l) => l.key === leaf.key);
    if (existing >= 0) {
      const keep = better(fam.leaves[existing].food, food);
      const dropped = keep === food ? fam.leaves[existing].food : food;
      fam.duplicates.set(leaf.key, [...(fam.duplicates.get(leaf.key) ?? []), dropped]);
      if (keep === food) fam.leaves[existing] = leaf;
    } else {
      fam.leaves.push(leaf);
    }
  }

  for (const fam of families.values()) {
    for (const leaf of fam.leaves) byId.set(leaf.food.id, { family: fam.base, leaf });
  }
  for (const leaf of unplaced) byId.set(leaf.food.id, { family: "", leaf });
  return { families, unplaced, byId };
}

// ───────────────────────── refining ─────────────────────────

/** Picked value meaning "none of the above": rows that do not carry this facet
 *  at all. Without it, "Ayam Pop" (no cooking method in its name) would be
 *  unreachable the moment you chose any method. */
export const NONE = "_none";

/** What the user has decided so far. A missing key means "not asked yet". */
export type Picks = Partial<Record<FacetAxis, string>>;

export type Option = {
  value: string;
  /** Display label: "Goreng". */
  label: string;
  /** How many remaining rows carry it. */
  count: number;
};

export type Step<T> = {
  /** Rows still in play. */
  leaves: Leaf<T>[];
  /** The next question, or null when there is nothing left worth asking. */
  axis: FacetAxis | null;
  options: Option[];
  /** The one row to pre-select: exactly the picks, nothing extra. null if no
   *  row is that plain. */
  canonical: Leaf<T> | null;
  /** True when exactly one row remains — nothing left to decide. */
  done: boolean;
};

const matches = <T,>(l: Leaf<T>, picks: Picks): boolean => {
  for (const axis of Object.keys(picks) as FacetAxis[]) {
    const want = picks[axis];
    if (!want) continue;
    const have = l.parsed.facets[axis];
    if (want === NONE ? have.length > 0 : !have.includes(want)) return false;
  }
  return true;
};

/**
 * One step of the walk: given what is picked, which rows remain, what is the
 * next question, and what is the plain default?
 */
export function refine<T>(family: Family<T>, picks: Picks = {}): Step<T> {
  const leaves = family.leaves.filter((l) => matches(l, picks));

  let axis: FacetAxis | null = null;
  let options: Option[] = [];

  const order = family.isDish ? DISH_AXIS_ORDER : AXIS_ORDER;
  for (const a of order) {
    if (picks[a]) continue; // already decided
    const counts = new Map<string, number>();
    let uncovered = 0;
    for (const l of leaves) {
      const vs = l.parsed.facets[a];
      if (vs.length === 0) uncovered++;
      for (const v of vs) counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    // Skip rule. An axis is a question only if it can split the remaining rows:
    // at least two distinct answers, counting "none of these" as an answer.
    // One value covering every row, or no value at all, decides nothing.
    const answers = counts.size + (uncovered > 0 ? 1 : 0);
    if (answers < 2) continue;
    // A question whose answer is "none of these" for three rows in four is not
    // really a question — it asks the user to hunt for the minority. Skip it and
    // let the next axis (or the row list) do the narrowing instead. Measured on
    // "sapi": 35 of 37 rows carry no cooking method, so "Dimasak?" was two chips
    // and a giant "Lainnya".
    if (uncovered / leaves.length > 0.75) continue;
    axis = a;
    options = [...counts]
      .map(([value, count]) => ({ value, label: cap(value), count }))
      .sort((x, y) => y.count - x.count || x.label.localeCompare(y.label, "id"));
    if (uncovered > 0 && counts.size > 0) options.push({ value: NONE, label: "Lainnya", count: uncovered });
    break;
  }

  // The plain default: a row whose facets are exactly what was picked and has
  // nothing left over. "Ayam goreng" for {prep: goreng}; not "Ayam Goreng Sabana".
  const canonical =
    leaves.find((l) => {
      if (l.parsed.rest.length > 0) return false;
      for (const a of order) {
        const have = l.parsed.facets[a];
        const want = picks[a];
        if (want === NONE ? have.length > 0 : want ? !(have.length === 1 && have[0] === want) : have.length > 0) return false;
      }
      return true;
    }) ?? null;

  return { leaves, axis, options, canonical, done: leaves.length === 1 };
}

/** Humble label for a leaf: the words that distinguish it from its siblings. */
export function leafLabel<T extends SearchableFood>(l: Leaf<T>): string {
  return l.food.name;
}
