"use client";

// What this user actually eats, as a number between 0 and 1.
//
// The complaint this exists to fix: "telor balado is still showing even though
// the user never picked it". Relevance cannot fix that — Telur Balado and Telur
// Goreng are both eggs, both curated staples, both spelled with the word you
// typed. Only behaviour separates them.
//
// The old answer was a hard partition in FoodBuilder: everything you ever
// tapped, above everything you never tapped, regardless of relevance. That
// cannot express "relevant but unfamiliar beats familiar but irrelevant",
// which is both halves of the complaint. This is a FEATURE instead — a capped
// multiplier on the relevance score, so behaviour reorders near-ties and never
// overrides a better match.
//
// Storage is two exponentially-decayed counters plus a slot histogram, which is
// algebraically identical to Σ 2^(-age/H) over every past pick but costs O(1)
// per pick and stores no event history.

import { scopedKey } from "./userScope.ts";

/** Half-lives, in days. */
const H_FAST = 10;
const H_SLOW = 120;
const H_SLOT = 60;

/** Saturation constants — sat(K, K) = 0.5. */
const K_FAST = 6;
const K_SLOW = 12;
const K_COOC = 3;

const W_FAST = 0.68;
const W_SLOW = 0.32;

/** Usage alone is the primary signal; context only shades it. */
const A_BASE = 0.7;
const W_SLOT = 0.18;
const W_COOC = 0.12;

/** Dirichlet prior pulling an unproven slot preference toward uniform. */
const SLOT_PRIOR = 4;

/** The most affinity can move a result: +40%. */
export const AFF_MAX = 0.4;

/** The most an ignored result can be pushed DOWN: 15%. Deliberately smaller
 *  than AFF_MAX — being shown something is far weaker evidence than choosing
 *  it, and a search result you scrolled past may simply not have been on
 *  screen. Position bias is real and uncorrected here, so the signal is kept
 *  timid on purpose. */
const SUPP_MAX = 0.15;
/** No suppression until a food has been ignored this many times more than it
 *  has been taken. Below that it is noise. */
const SUPP_MIN = 8;
const SUPP_K = 8;
/** Cap on the impressions store. */
const MAX_SHOWN = 400;

const KEY = "richie.foodaffinity.v1";
/** 300, not the old 60. A year of eating is a few hundred distinct foods, and
 *  the whole point is to remember the monthly ones. ~2.5 KiB against a 1 MiB
 *  catalogue cache — storage is not the constraint here. */
const MAX_FOODS = 300;

export type Slot = 0 | 1 | 2 | 3; // breakfast, lunch, dinner, snack

export type AffinityStore = Store;

export type AffinityRow = {
  /** Decayed pick count, 10-day half-life — "is this current". */
  nf: number;
  /** Decayed pick count, 120-day half-life — "is this in your repertoire". */
  ns: number;
  /** Decayed picks per meal slot, 60-day half-life. */
  sl: [number, number, number, number];
  /** Epoch ms of the last pick, so reads can decay lazily. */
  last: number;
};

type Store = {
  foods: Record<string, AffinityRow>;
  /** Co-occurrence: "a|b" (ids sorted) → decayed count of shared days. */
  pairs: Record<string, number>;
  /** id → how many times it has been SHOWN in a result list and not chosen.
   *  See suppression() — this is the only signal that can express "you have
   *  put this in front of me twenty times and I have never once wanted it". */
  shown?: Record<string, number>;
};

const EMPTY: Store = { foods: {}, pairs: {}, shown: {} };

function read(): Store {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(scopedKey(KEY));
    if (!raw) return EMPTY;
    const p = JSON.parse(raw) as Store;
    return p && p.foods ? { foods: p.foods, pairs: p.pairs ?? {}, shown: p.shown ?? {} } : EMPTY;
  } catch {
    return EMPTY;
  }
}

function write(s: Store): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(scopedKey(KEY), JSON.stringify(s));
  } catch {
    /* quota — affinity is an optimisation, never a correctness requirement */
  }
}

const DAY = 86_400_000;
const decay = (v: number, days: number, half: number) => v * Math.pow(2, -days / half);
const sat = (x: number, k: number) => x / (x + k);
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Meal slot from a wall-clock hour. Indonesian eating hours, not US ones. */
export function slotOf(d: Date = new Date()): Slot {
  const h = d.getHours();
  if (h < 10) return 0; // sarapan
  if (h < 15) return 1; // makan siang
  if (h < 21) return 2; // makan malam
  return 3; // ngemil
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Record a pick. `alsoToday` are the other foods already on the plate, which is
 * what makes "nasi goreng usually comes with telur" learnable.
 */
export function recordAffinity(id: string, alsoToday: string[] = [], at = Date.now()): void {
  if (typeof window === "undefined" || !id) return;
  const s = read();
  const prev = s.foods[id];
  const days = prev ? Math.max(0, (at - prev.last) / DAY) : 0;
  const slot = slotOf(new Date(at));

  const row: AffinityRow = prev
    ? {
        nf: decay(prev.nf, days, H_FAST) + 1,
        ns: decay(prev.ns, days, H_SLOW) + 1,
        sl: prev.sl.map((v) => decay(v, days, H_SLOT)) as AffinityRow["sl"],
        last: at,
      }
    : { nf: 1, ns: 1, sl: [0, 0, 0, 0], last: at };
  row.sl[slot] += 1;
  s.foods[id] = row;

  for (const other of alsoToday) {
    if (!other || other === id) continue;
    const k = pairKey(id, other);
    s.pairs[k] = (s.pairs[k] ?? 0) + 1;
  }

  // Prune by slow-decayed usage: the monthly foods are exactly what we want to
  // keep, so pruning on recency alone would defeat the point of H_SLOW.
  const ids = Object.keys(s.foods);
  if (ids.length > MAX_FOODS) {
    const keep = new Set(
      ids
        .sort((a, b) => currentNs(s.foods[b], at) - currentNs(s.foods[a], at))
        .slice(0, MAX_FOODS)
    );
    for (const k of ids) if (!keep.has(k)) delete s.foods[k];
    for (const k of Object.keys(s.pairs)) {
      const [a, b] = k.split("|");
      if (!keep.has(a) || !keep.has(b)) delete s.pairs[k];
    }
  }
  write(s);
}

function currentNs(r: AffinityRow, now: number): number {
  return decay(r.ns, Math.max(0, (now - r.last) / DAY), H_SLOW);
}

/**
 * Record that these ids were SHOWN to the user. Call when a query settles, not
 * per keystroke — every prefix of "telur" would otherwise count as five
 * separate impressions of the same list.
 */
export function recordImpressions(ids: string[], at = Date.now()): void {
  if (typeof window === "undefined" || ids.length === 0) return;
  const s = read();
  const shown = s.shown ?? (s.shown = {});
  for (const id of ids) shown[id] = (shown[id] ?? 0) + 1;

  const keys = Object.keys(shown);
  if (keys.length > MAX_SHOWN) {
    const keep = new Set(keys.sort((a, b) => shown[b] - shown[a]).slice(0, MAX_SHOWN));
    for (const k of keys) if (!keep.has(k)) delete shown[k];
  }
  write(s);
  void at;
}

export type AffinityContext = {
  now?: number;
  slot?: Slot;
  /** Ids already logged today — drives the co-occurrence term. */
  plate?: string[];
};

/**
 * Build a scorer for the whole result list. Reading localStorage once and
 * returning a closure matters: this is called per result, per keystroke.
 *
 * Returns a function giving 0..1. Zero for an unknown food, which is correct —
 * a new food must not be punished, only a familiar one rewarded. That
 * asymmetry is what stops the feedback loop where you only ever see what you
 * have already eaten.
 */
export function affinityScorer(ctx: AffinityContext = {}): (id: string) => number {
  return makeScorer(read(), ctx);
}

/** The scoring maths, with the store passed in. Pure, so it can be tested and
 *  simulated without a browser. */
export function makeScorer(s: Store, ctx: AffinityContext = {}): (id: string) => number {
  const now = ctx.now ?? Date.now();
  const slot = ctx.slot ?? slotOf(new Date(now));
  const plate = ctx.plate ?? [];

  if (Object.keys(s.foods).length === 0) return () => 0;

  return (id: string): number => {
    const r = s.foods[id];
    if (!r) return 0;
    const days = Math.max(0, (now - r.last) / DAY);

    // "Is this current" and "is this in your repertoire" are different
    // questions and one half-life cannot answer both. A dish eaten monthly
    // reads as abandoned at 21 days and alive at 120.
    const nf = decay(r.nf, days, H_FAST);
    const ns = decay(r.ns, days, H_SLOW);
    const use = W_FAST * sat(nf, K_FAST) + W_SLOW * sat(ns, K_SLOW);
    if (use <= 0) return 0;

    // Slot fit, smoothed toward uniform so one breakfast doesn't declare a
    // breakfast food.
    const sl = r.sl.map((v) => decay(v, days, H_SLOT));
    const totalSl = sl[0] + sl[1] + sl[2] + sl[3];
    const share = (sl[slot] + 0.25 * SLOT_PRIOR) / (totalSl + SLOT_PRIOR);
    const slotFit = clamp01((share - 0.25) / 0.75);

    let coocFit = 0;
    for (const f of plate) {
      if (f === id) continue;
      const c = s.pairs[pairKey(id, f)];
      if (c) coocFit = Math.max(coocFit, sat(c, K_COOC));
    }

    return clamp01(use * (A_BASE + W_SLOT * slotFit + W_COOC * coocFit));
  };
}

/**
 * How much to push DOWN a food the user keeps being shown and keeps ignoring.
 * Returns 0..1, applied by the caller as `total *= 1 - SUPP_MAX * s`.
 *
 * This is the direct answer to "telor balado is still showing even though the
 * user never picked it": affinity can only lift what you DO eat, and cannot
 * say anything about a food you have never touched. Being repeatedly offered
 * something and never taking it is the only evidence that distinguishes
 * "unknown" from "not for me".
 *
 * Netted against picks, so a food you eat weekly is never suppressed for also
 * being shown often.
 */
export function suppressionScorer(): (id: string) => number {
  return makeSuppressor(read());
}

export function makeSuppressor(s: Store): (id: string) => number {
  const shown = s.shown;
  if (!shown) return () => 0;
  return (id: string): number => {
    const n = shown[id];
    if (!n) return 0;
    const taken = s.foods[id]?.ns ?? 0;
    const ignored = n - 3 * taken;
    if (ignored <= SUPP_MIN) return 0;
    return sat(ignored - SUPP_MIN, SUPP_K);
  };
}

/** Seed the decayed counters from the legacy {count, last} picks store, so an
 *  existing user's history is not thrown away on upgrade. Idempotent. */
export function migrateFromPicks(
  picks: { id: string; count: number; last: number }[],
  now = Date.now()
): void {
  if (typeof window === "undefined") return;
  const s = read();
  if (Object.keys(s.foods).length > 0) return;
  for (const p of picks) {
    if (!p?.id || !(p.count > 0)) continue;
    // The old store kept no per-pick times, so treat the count as having
    // happened at `last`. That over-weights an old burst slightly and is much
    // better than discarding the history.
    s.foods[p.id] = { nf: p.count, ns: p.count, sl: [0, 0, 0, 0], last: p.last || now };
  }
  write(s);
}

/** Wipe on sign-out — another account's habits must not rank your food. */
export function clearAffinity(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(scopedKey(KEY));
  } catch {
    /* nothing useful to do */
  }
}
