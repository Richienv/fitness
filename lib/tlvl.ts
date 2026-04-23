"use client";

import { macrosFor, type Macros } from "./ingredients";
import {
  getAllMeals,
  getDaily,
  isCustomItem,
  setDaily,
  type DailyFlags,
  type MealItem,
  type MealLog,
  type TLvlInputs,
} from "./store";
import { TARGETS } from "./targets";
import { getAllWorkouts, type WorkoutSession } from "./workouts";

const BASELINE = 100;
const FLOOR = 40;
const CEILING = 160;
const DAILY_PP_CAP = 4;
const PULL_TO_MEAN = 0.03;
const GAP_RESET_DAYS = 14;

// Canonical list of compound lifts — avoids brittle per-session name matching.
const COMPOUND_LIFTS = new Set(
  [
    "Bench Press",
    "Flat Bench Press",
    "Incline DB Press",
    "Squat",
    "Hack Squat",
    "Romanian Deadlift",
    "Deadlift",
    "OHP",
    "Seated DB Press",
    "Lat Pulldown",
    "Cable Row",
    "Seated Row Machine",
    "T-Bar Row",
    "DB Row",
    "Wide Grip Pulldown",
    "Cable Row Wide",
  ].map((s) => s.toLowerCase())
);

export type FactorKey = "sleep" | "strength" | "nutrition" | "stress" | "alcohol" | "cardio";

export type FactorContribution = {
  key: FactorKey;
  label: string;
  pp: number;
  /** Short inline hint shown in the UI. */
  hint: string;
  auto: boolean;
};

export type TLvlBreakdown = {
  date: string;
  score: number;
  delta_pp: number;
  factors: FactorContribution[];
};

export type TLvlRangeSummary = {
  avgScore: number;
  deltaVsPrev: number;
  topFactor: { key: FactorKey; label: string; totalPp: number } | null;
  positiveStreak: number;
  endScore: number;
};

// -------------------- Storage --------------------

export function getTLvlInputs(date: string): TLvlInputs {
  return getDaily(date).tlvl ?? {};
}

export function setTLvlInputs(date: string, patch: Partial<TLvlInputs>): void {
  const cur = getDaily(date);
  const merged: TLvlInputs = { ...(cur.tlvl ?? {}) };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete (merged as Record<string, unknown>)[k];
    else (merged as Record<string, unknown>)[k] = v;
  }
  const next: DailyFlags = { ...cur, tlvl: merged };
  setDaily(next);
}

// -------------------- Date helpers --------------------

function parseDate(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function addDays(key: string, n: number): string {
  const d = parseDate(key);
  d.setUTCDate(d.getUTCDate() + n);
  return formatDate(d);
}

function dayDiff(a: string, b: string): number {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86_400_000);
}

// -------------------- Data helpers --------------------

function sumMealMacros(items: MealItem[]): Macros {
  return items.reduce<Macros>(
    (acc, it) => {
      const m = isCustomItem(it)
        ? { kcal: it.kcal, protein: it.protein, fat: it.fat, carbs: it.carbs }
        : macrosFor(it.id, it.qty);
      return {
        kcal: acc.kcal + m.kcal,
        protein: acc.protein + m.protein,
        fat: acc.fat + m.fat,
        carbs: acc.carbs + m.carbs,
      };
    },
    { kcal: 0, protein: 0, fat: 0, carbs: 0 }
  );
}

function mealsForDate(all: MealLog[], date: string): MealLog[] {
  return all.filter((m) => m.date === date);
}

function workoutForDate(all: WorkoutSession[], date: string): WorkoutSession | null {
  return all.find((w) => w.date === date && w.completed) ?? null;
}

function workoutHasCompound(w: WorkoutSession): boolean {
  for (const ex of w.exercises) {
    if (COMPOUND_LIFTS.has(ex.exerciseName.toLowerCase())) return true;
  }
  return false;
}

// -------------------- Factor contributions --------------------

function sleepFactor(inputs: TLvlInputs): FactorContribution {
  const h = inputs.sleepHours;
  if (h === undefined) {
    return { key: "sleep", label: "Sleep", pp: 0, hint: "Not logged", auto: false };
  }
  if (h >= 7.5 && h <= 9) return { key: "sleep", label: "Sleep", pp: 2.0, hint: `${h}h · optimal`, auto: false };
  if ((h >= 6.5 && h < 7.5) || (h > 9 && h <= 10))
    return { key: "sleep", label: "Sleep", pp: 0.5, hint: `${h}h · decent`, auto: false };
  if (h >= 5.5 && h < 6.5) return { key: "sleep", label: "Sleep", pp: -1.0, hint: `${h}h · short`, auto: false };
  if (h < 5.5) return { key: "sleep", label: "Sleep", pp: -2.0, hint: `${h}h · too short`, auto: false };
  return { key: "sleep", label: "Sleep", pp: -0.5, hint: `${h}h · oversleeping`, auto: false };
}

function stressFactor(inputs: TLvlInputs): FactorContribution {
  const s = inputs.stressLevel;
  if (s === undefined) {
    return { key: "stress", label: "Stress", pp: 0, hint: "Not logged", auto: false };
  }
  if (s <= 3) return { key: "stress", label: "Stress", pp: 1.0, hint: `${s}/10 · chill`, auto: false };
  if (s <= 5) return { key: "stress", label: "Stress", pp: 0.2, hint: `${s}/10 · steady`, auto: false };
  if (s <= 7) return { key: "stress", label: "Stress", pp: -0.5, hint: `${s}/10 · tense`, auto: false };
  return { key: "stress", label: "Stress", pp: -1.0, hint: `${s}/10 · maxed`, auto: false };
}

function alcoholFactor(inputs: TLvlInputs): FactorContribution {
  if (inputs.alcohol) {
    return { key: "alcohol", label: "Alcohol", pp: -0.4, hint: "Drink logged", auto: false };
  }
  return { key: "alcohol", label: "Alcohol", pp: 0, hint: "Dry day", auto: false };
}

function cardioFactor(inputs: TLvlInputs): FactorContribution {
  const m = inputs.cardioMin ?? 0;
  if (m > 75) return { key: "cardio", label: "Cardio", pp: -0.3, hint: `${m} min · endurance creep`, auto: false };
  return { key: "cardio", label: "Cardio", pp: 0, hint: m > 0 ? `${m} min` : "None", auto: false };
}

function strengthFactor(
  workout: WorkoutSession | null,
  daily: DailyFlags,
  engaged: boolean,
  isPast: boolean
): FactorContribution {
  if (workout) {
    if (workoutHasCompound(workout)) {
      return { key: "strength", label: "Strength", pp: 1.5, hint: "Compound lift session", auto: true };
    }
    return { key: "strength", label: "Strength", pp: 0.7, hint: "Workout logged", auto: true };
  }
  if (daily.gymDay && isPast && engaged) {
    return { key: "strength", label: "Strength", pp: -0.5, hint: "Gym day skipped", auto: true };
  }
  return { key: "strength", label: "Strength", pp: 0, hint: daily.gymDay ? "No workout yet" : "Rest day", auto: true };
}

function nutritionFactor(
  meals: MealLog[],
  gymDay: boolean
): FactorContribution {
  if (meals.length === 0) {
    return { key: "nutrition", label: "Nutrition", pp: 0, hint: "No meals logged", auto: true };
  }
  const totals = meals.reduce(
    (acc, m) => {
      const s = sumMealMacros(m.items);
      return {
        kcal: acc.kcal + s.kcal,
        protein: acc.protein + s.protein,
        fat: acc.fat + s.fat,
        carbs: acc.carbs + s.carbs,
      };
    },
    { kcal: 0, protein: 0, fat: 0, carbs: 0 }
  );
  const target = gymDay ? TARGETS.gymDay : TARGETS.restDay;
  let pp = 0;
  const notes: string[] = [];
  if (totals.protein >= target.protein) {
    pp += 0.8;
    notes.push("protein ✓");
  } else {
    notes.push(`protein ${Math.round(totals.protein)}/${target.protein}g`);
  }
  const kcalRatio = totals.kcal / target.kcal;
  if (kcalRatio >= 0.8 && kcalRatio <= 1.2) {
    pp += 0.3;
    notes.push("kcal on target");
  } else if (kcalRatio < 0.7) {
    pp -= 0.7;
    notes.push("deep deficit");
  }
  if (totals.fat >= 60) {
    pp += 0.3;
    notes.push("fat ≥ 60g");
  }
  return {
    key: "nutrition",
    label: "Nutrition",
    pp,
    hint: notes.join(" · "),
    auto: true,
  };
}

// -------------------- Per-day breakdown --------------------

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function applyDelta(prev: number, delta_pp: number): number {
  const compound = prev * (1 + delta_pp / 100);
  const pull = (BASELINE - prev) * PULL_TO_MEAN;
  return clamp(compound + pull, FLOOR, CEILING);
}

function dailyEngagement(
  date: string,
  meals: MealLog[],
  daily: DailyFlags,
  tlvl: TLvlInputs
): boolean {
  if (meals.length > 0) return true;
  if (Object.values(daily.checklist ?? {}).some(Boolean)) return true;
  if (Object.keys(tlvl).length > 0) return true;
  return false;
}

function breakdownFor(
  date: string,
  meals: MealLog[],
  workout: WorkoutSession | null,
  daily: DailyFlags,
  tlvl: TLvlInputs,
  isPast: boolean,
  prevScore: number
): TLvlBreakdown {
  const engaged = dailyEngagement(date, meals, daily, tlvl);
  const factors: FactorContribution[] = [
    sleepFactor(tlvl),
    strengthFactor(workout, daily, engaged, isPast),
    nutritionFactor(meals, daily.gymDay),
    stressFactor(tlvl),
    alcoholFactor(tlvl),
    cardioFactor(tlvl),
  ];
  const raw = factors.reduce((a, f) => a + f.pp, 0);
  const delta_pp = clamp(raw, -DAILY_PP_CAP, DAILY_PP_CAP);
  const score = applyDelta(prevScore, delta_pp);
  return { date, score, delta_pp, factors };
}

// -------------------- Walking a range --------------------

function firstInputDate(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem("richie.daily.v1");
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, DailyFlags>;
    const dates = Object.keys(map)
      .filter((d) => !!map[d]?.tlvl && Object.keys(map[d]!.tlvl!).length > 0)
      .sort();
    return dates[0] ?? null;
  } catch {
    return null;
  }
}

function computeWalk(fromDate: string, toDate: string): TLvlBreakdown[] {
  const out: TLvlBreakdown[] = [];
  const allMeals = getAllMeals();
  const allWorkouts = getAllWorkouts();
  const today = formatDate(new Date());
  let prev = BASELINE;
  let lastInputDate: string | null = null;
  for (let cur = fromDate; dayDiff(cur, toDate) >= 0; cur = addDays(cur, 1)) {
    const daily = getDaily(cur);
    const tlvl = daily.tlvl ?? {};
    const hasInputs = Object.keys(tlvl).length > 0;
    if (lastInputDate && dayDiff(lastInputDate, cur) > GAP_RESET_DAYS) {
      prev = BASELINE;
    }
    const meals = mealsForDate(allMeals, cur);
    const workout = workoutForDate(allWorkouts, cur);
    const isPast = dayDiff(cur, today) > 0;
    const b = breakdownFor(cur, meals, workout, daily, tlvl, isPast, prev);
    out.push(b);
    prev = b.score;
    if (hasInputs) lastInputDate = cur;
  }
  return out;
}

export function computeTLvl(date: string): TLvlBreakdown {
  const start = firstInputDate() ?? date;
  // If the target is before the first input, return the baseline.
  if (dayDiff(start, date) < 0) {
    return {
      date,
      score: BASELINE,
      delta_pp: 0,
      factors: [
        sleepFactor({}),
        strengthFactor(null, getDaily(date), false, false),
        nutritionFactor([], getDaily(date).gymDay),
        stressFactor({}),
        alcoholFactor({}),
        cardioFactor({}),
      ],
    };
  }
  const walk = computeWalk(start, date);
  return walk[walk.length - 1];
}

export function computeTLvlRange(from: string, to: string): TLvlBreakdown[] {
  const start = firstInputDate();
  // Prime the score by walking from the earliest logged input up to `from - 1`,
  // then return breakdowns for the requested window [from, to].
  if (!start || dayDiff(start, from) <= 0) {
    return computeWalk(from, to);
  }
  const full = computeWalk(start, to);
  return full.filter((b) => dayDiff(from, b.date) >= 0);
}

// -------------------- Range summaries --------------------

export function rangeSummary(
  current: TLvlBreakdown[],
  previous: TLvlBreakdown[] = []
): TLvlRangeSummary {
  if (current.length === 0) {
    return { avgScore: BASELINE, deltaVsPrev: 0, topFactor: null, positiveStreak: 0, endScore: BASELINE };
  }
  const avg = current.reduce((a, b) => a + b.score, 0) / current.length;
  const prevAvg =
    previous.length > 0 ? previous.reduce((a, b) => a + b.score, 0) / previous.length : avg;
  const totals = new Map<FactorKey, { label: string; pp: number }>();
  for (const b of current) {
    for (const f of b.factors) {
      const cur = totals.get(f.key) ?? { label: f.label, pp: 0 };
      cur.pp += f.pp;
      totals.set(f.key, cur);
    }
  }
  let top: TLvlRangeSummary["topFactor"] = null;
  for (const [key, v] of totals) {
    if (!top || Math.abs(v.pp) > Math.abs(top.totalPp)) {
      top = { key, label: v.label, totalPp: v.pp };
    }
  }
  let streak = 0;
  for (let i = current.length - 1; i >= 0; i--) {
    if (current[i].delta_pp > 0) streak++;
    else break;
  }
  return {
    avgScore: avg,
    deltaVsPrev: avg - prevAvg,
    topFactor: top,
    positiveStreak: streak,
    endScore: current[current.length - 1].score,
  };
}

export { BASELINE as TLVL_BASELINE, FLOOR as TLVL_FLOOR, CEILING as TLVL_CEILING };
