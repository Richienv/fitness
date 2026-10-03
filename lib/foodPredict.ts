// What the user probably wants next — as an ORDERING, never as a decision.
//
// Ranking supplies a visible, editable default. It never commits a meal.
// Confirmed frequency decays over 60 days; affinity adds meal-slot and food-pair
// context. Catalogue popularity supplies the cold-start prior.
//
// THE MODEL: Dirichlet-style shrinkage between two distributions.
//
//   share_prior(option) ∝ catalogue popularity behind that option      (known on day 1)
//   share_user(option)  ∝ how much THIS user has eaten behind it       (learned online)
//
//   score = (1 − λ) · share_prior + λ · share_user,     λ = n / (n + K)
//
// n is the total user evidence in play, so λ is 0 for a new user (pure prior),
// and climbs smoothly as history accumulates — there is no "enough data" switch
// to tune or to flicker across. K is the number of picks at which the user's own
// habits and the catalogue count equally.
//
// User evidence combines confirmed counts with affinity from foodAffinity.ts.
// Every food id represents a real preparation/cut combination.
//
// WHY NOT A TRAINED CLASSIFIER: one user, a handful of picks a day, cold start on
// day one, and every pick must update the model in O(1). A parametric model has
// nothing to fit on; counts with a prior is what is actually identifiable, and
// it is inspectable — you can say WHY "bakar" is first.

import type { Family, Leaf, Option, Picks, Step } from "./foodFamilies.ts";
import { refine } from "./foodFamilies.ts";
import type { FacetAxis } from "./foodFacets.ts";
import type { SearchableFood } from "./foodSearch.ts";

/** Picks at which the user's habits and the catalogue prior weigh equally. */
export const K = 3;

export type PredictorInput = {
  /** 0..1 — how much this user eats a food now. From affinityScorer(). */
  affinity: (id: string) => number;
  /** Confirmed additions; never pointer/scroll events. Unknown ids are ignored. */
  history?: readonly { id: string; count: number; last: number }[];
  now?: number;
};

export type Predictor = {
  /** Order family tiles. Higher is first. */
  familyScore: (f: Family<SearchableFood>) => number;
  /** Order a step's options. Returns a new array. */
  orderOptions: <T extends SearchableFood>(
    family: Family<T>,
    axis: FacetAxis,
    options: Option[],
    picks: Picks
  ) => Option[];
  /** Order final leaves, best first. */
  orderLeaves: <T extends SearchableFood>(leaves: Leaf<T>[]) => Leaf<T>[];
  /** How much user evidence backs a family (0 = pure prior). Exposed so the UI
   *  can say "Biasa kamu" only when that is actually true. */
  evidence: (f: Family<SearchableFood>) => number;
  foodEvidence: (id: string) => number;
};

const popOf = (f: SearchableFood) => Math.max(0, f.popularity ?? 0) + 1; // +1: smoothing, never zero

export function makePredictor({ affinity, history = [], now = Date.now() }: PredictorInput): Predictor {
  const counts = new Map<string, number>();
  for (const row of history) {
    if (!row || typeof row.id !== "string" || !Number.isFinite(row.count) || row.count <= 0 || !Number.isFinite(row.last)) continue;
    const days = Math.max(0, (now - row.last) / 86_400_000);
    // Recent repeated choices outweigh an old habit. Each row is a real
    // catalogue combination (cut + cooking method), not independent guesses.
    counts.set(row.id, row.count * Math.pow(2, -days / 60));
  }
  const foodEvidence = (id: string) => {
    const context = affinity(id);
    return (counts.get(id) ?? 0) + (Number.isFinite(context) ? Math.max(0, Math.min(1, context)) : 0);
  };
  const userMass = <T extends SearchableFood>(leaves: Leaf<T>[]) =>
    leaves.reduce((n, l) => n + foodEvidence(l.food.id), 0);
  const priorMass = <T extends SearchableFood>(leaves: Leaf<T>[]) =>
    leaves.reduce((n, l) => n + popOf(l.food), 0);

  const lambda = (n: number) => n / (n + K);

  function familyScore(f: Family<SearchableFood>): number {
    const u = userMass(f.leaves);
    // A family's prior is its single most popular row, not the sum: "kue" has
    // 136 obscure rows and must not outrank "nasi" on head-count alone.
    const prior = Math.max(...f.leaves.map((l) => popOf(l.food))) / 130;
    const lam = lambda(u);
    return (1 - lam) * Math.min(1, prior) + lam * (1 + Math.min(u, 8) / 8);
  }

  function orderOptions<T extends SearchableFood>(
    family: Family<T>,
    axis: FacetAxis,
    options: Option[],
    picks: Picks
  ): Option[] {
    const pool = refine(family, picks).leaves;
    const withMass = options.map((o) => {
      const inOpt = pool.filter((l) =>
        o.value === "_none" ? l.parsed.facets[axis].length === 0 : l.parsed.facets[axis].includes(o.value)
      );
      return { o, u: userMass(inOpt), p: priorMass(inOpt) };
    });
    const totalU = withMass.reduce((n, x) => n + x.u, 0);
    const totalP = withMass.reduce((n, x) => n + x.p, 0) || 1;
    const lam = lambda(totalU);
    const ranked = withMass
      .map((x) => ({
        o: x.o,
        s: (1 - lam) * (x.p / totalP) + lam * (totalU > 0 ? x.u / totalU : 0),
      }))
      .sort((a, b) => b.s - a.s || b.o.count - a.o.count || a.o.value.localeCompare(b.o.value, "id"))
      .map((x) => x.o);
    // "Lainnya" is a catch-all, not a preference, and it is usually the largest
    // bucket — so on any score it would lead. It always goes last: a way out for
    // the rows nothing else describes, never the headline.
    return [...ranked.filter((o) => o.value !== "_none"), ...ranked.filter((o) => o.value === "_none")];
  }

  function orderLeaves<T extends SearchableFood>(leaves: Leaf<T>[]): Leaf<T>[] {
    const totalU = userMass(leaves);
    const lam = lambda(totalU);
    const totalP = leaves.reduce((n, l) => n + popOf(l.food), 0) || 1;
    return [...leaves].sort((a, b) => {
      const sa = (1 - lam) * (popOf(a.food) / totalP) + lam * (totalU > 0 ? foodEvidence(a.food.id) / totalU : 0);
      const sb = (1 - lam) * (popOf(b.food) / totalP) + lam * (totalU > 0 ? foodEvidence(b.food.id) / totalU : 0);
      // Shorter name breaks ties: fewer words the user did not ask for.
      return sb - sa || a.food.name.length - b.food.name.length || a.food.id.localeCompare(b.food.id);
    });
  }

  return {
    familyScore,
    orderOptions,
    orderLeaves,
    evidence: (f) => userMass(f.leaves),
    foodEvidence,
  };
}

/** Convenience: a refine() step with its options and leaves already ordered. */
export function orderedStep<T extends SearchableFood>(
  family: Family<T>,
  picks: Picks,
  predictor: Predictor
): Step<T> {
  const st = refine(family, picks);
  return {
    ...st,
    options: st.axis ? predictor.orderOptions(family, st.axis, st.options, picks) : st.options,
    leaves: predictor.orderLeaves(st.leaves),
  };
}
