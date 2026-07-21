"use client";

// Remembers which foods this user actually adds, so search can float them to the
// top next time and the builder can suggest their staples for one-tap logging.
// Local-first (per-user via scopedKey), mirrors lib/store conventions.

import { scopedKey } from "./userScope";

export type FoodPick = {
  id: string;
  name: string;
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
  unit?: string;
  gramsPerUnit?: number;
  step?: number;
  count: number; // how many times added
  last: number; // epoch ms of the last add
};

const KEY = "richie.foodpicks.v1";
const MAX = 60; // cap the store; prune the least useful beyond this

function read(): Record<string, FoodPick> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(scopedKey(KEY));
    return raw ? (JSON.parse(raw) as Record<string, FoodPick>) : {};
  } catch {
    return {};
  }
}

function write(all: Record<string, FoodPick>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(scopedKey(KEY), JSON.stringify(all));
  } catch {
    /* ignore quota */
  }
}

/** Staple score: frequency, with a gentle recency lift so a food you used today
 *  outranks one you used a lot months ago. Used for ordering everywhere. */
export function pickScore(p: FoodPick, now = Date.now()): number {
  const days = Math.max(0, (now - p.last) / 86_400_000);
  const recency = Math.exp(-days / 21); // ~3-week half-life-ish decay
  return p.count + recency * 2;
}

export type PickInput = {
  id: string;
  name: string;
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
  unit?: string;
  gramsPerUnit?: number;
  step?: number;
};

/** Record that the user added this food (once per add action, not per stepper
 *  tick). Bumps its count + recency. */
export function recordFoodPick(f: PickInput): void {
  if (typeof window === "undefined" || !f?.id) return;
  const all = read();
  const prev = all[f.id];
  all[f.id] = {
    id: f.id,
    name: f.name,
    kcal: f.kcal,
    protein: f.protein,
    fat: f.fat,
    carbs: f.carbs,
    unit: f.unit,
    gramsPerUnit: f.gramsPerUnit,
    step: f.step,
    count: (prev?.count ?? 0) + 1,
    last: Date.now(),
  };
  // Prune to the top MAX by score if we've grown too large.
  const entries = Object.values(all);
  if (entries.length > MAX) {
    const keep = entries.sort((a, b) => pickScore(b) - pickScore(a)).slice(0, MAX);
    const next: Record<string, FoodPick> = {};
    for (const e of keep) next[e.id] = e;
    write(next);
    return;
  }
  write(all);
}

/** All picks, best staple first. */
export function getFoodPicks(): FoodPick[] {
  const now = Date.now();
  return Object.values(read()).sort((a, b) => pickScore(b, now) - pickScore(a, now));
}

/** Fast membership + rank lookup for boosting search results. */
export function getPickRank(): Map<string, number> {
  const m = new Map<string, number>();
  getFoodPicks().forEach((p, i) => m.set(p.id, i));
  return m;
}
