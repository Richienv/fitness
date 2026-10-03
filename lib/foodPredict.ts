// What the user probably wants next — as an ORDERING, never as a decision.
//
// This module only ranks. It never adds a food, never chooses a portion, never
// skips a question on the user's behalf. A wrong guess costs one extra glance at
// a list; an auto-filled calorie number the user did not see is a wrong entry in
// their log. The first is a UX nuisance, the second breaks the one promise this
// app makes — that the numbers are credible — so prediction is confined to the
// safe side of that line.
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
// "User evidence" is the affinity from lib/foodAffinity.ts, which already folds
// in recency (two half-lives), meal slot and what is on the tray — so this does
// not re-implement habit, it just AGGREGATES it from foods up to facet values.
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
};

const popOf = (f: SearchableFood) => Math.max(0, f.popularity ?? 0) + 1; // +1: smoothing, never zero

export function makePredictor({ affinity }: PredictorInput): Predictor {
  const userMass = <T extends SearchableFood>(leaves: Leaf<T>[]) =>
    leaves.reduce((n, l) => n + affinity(l.food.id), 0);
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
      .sort((a, b) => b.s - a.s || b.o.count - a.o.count)
      .map((x) => x.o);
    // "Lainnya" is a catch-all, not a preference, and it is usually the largest
    // bucket — so on any score it would lead. It always goes last: a way out for
    // the rows nothing else describes, never the headline.
    return [...ranked.filter((o) => o.value !== "_none"), ...ranked.filter((o) => o.value === "_none")];
  }

  function orderLeaves<T extends SearchableFood>(leaves: Leaf<T>[]): Leaf<T>[] {
    const totalU = leaves.reduce((n, l) => n + affinity(l.food.id), 0);
    const lam = lambda(totalU);
    const totalP = leaves.reduce((n, l) => n + popOf(l.food), 0) || 1;
    return [...leaves].sort((a, b) => {
      const sa = (1 - lam) * (popOf(a.food) / totalP) + lam * (totalU > 0 ? affinity(a.food.id) / totalU : 0);
      const sb = (1 - lam) * (popOf(b.food) / totalP) + lam * (totalU > 0 ? affinity(b.food.id) / totalU : 0);
      // Shorter name breaks ties: fewer words the user did not ask for.
      return sb - sa || a.food.name.length - b.food.name.length;
    });
  }

  return {
    familyScore,
    orderOptions,
    orderLeaves,
    evidence: (f) => userMass(f.leaves),
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
