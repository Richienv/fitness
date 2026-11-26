"use client";

import { burnReader } from "./burnData";
import { cycleMetabolicEffect } from "./cycle";
import { macrosFor } from "./ingredients";
import { getAllMeasurements, getLatestMeasurement } from "./measurements";
import {
  computeMetabolicSnapshot,
  computeNeatFactor,
  isValidTodayCondition,
  precisionBmr,
  type MetabolicHistoryDay,
  type MetabolicSnapshot,
  type TodayCondition,
} from "./metabolicEngine";
import { getProfile, profileComplete } from "./settings";
import { getAllSleep } from "./sleep";
import { getAllMeals, isCustomItem, type MealLog } from "./store";
import { todayKey } from "./targets";
import { scopedKey } from "./userScope";

const CONDITION_KEY = "r2.todayCondition.v1";
const METABOLIC_CACHE_KEY = "r2.metabolicCache.v1";

function shiftYmd(baseYmd: string, deltaDays: number): string {
  const ms = Date.parse(`${baseYmd}T12:00:00Z`) + deltaDays * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

function sumDayMacros(meals: readonly MealLog[]): {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
} {
  let kcal = 0;
  let proteinG = 0;
  let carbsG = 0;
  let fatG = 0;
  for (const meal of meals) {
    for (const item of meal.items) {
      if (isCustomItem(item)) {
        kcal += Number(item.kcal) || 0;
        proteinG += Number(item.protein) || 0;
        carbsG += Number(item.carbs) || 0;
        fatG += Number(item.fat) || 0;
      } else {
        const m = macrosFor(item.id, item.qty);
        kcal += m.kcal;
        proteinG += m.protein;
        carbsG += m.carbs;
        fatG += m.fat;
      }
    }
  }
  return { kcal, proteinG, carbsG, fatG };
}

export function getTodayCondition(date: string = todayKey()): TodayCondition {
  if (typeof window === "undefined") return "normal";
  try {
    const raw = window.localStorage.getItem(scopedKey(CONDITION_KEY));
    if (!raw) return "normal";
    const map = JSON.parse(raw) as Record<string, unknown>;
    const v = map?.[date];
    return isValidTodayCondition(v) ? v : "normal";
  } catch {
    return "normal";
  }
}

export function setTodayCondition(
  date: string,
  condition: TodayCondition,
): void {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(scopedKey(CONDITION_KEY));
    const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    const next: Record<string, TodayCondition> = {};
    const minKeep = shiftYmd(date, -14);
    if (parsed && typeof parsed === "object") {
      for (const [k, v] of Object.entries(parsed)) {
        if (k >= minKeep && isValidTodayCondition(v)) {
          next[k] = v;
        }
      }
    }
    if (condition === "normal") {
      delete next[date];
    } else {
      next[date] = condition;
    }
    window.localStorage.setItem(scopedKey(CONDITION_KEY), JSON.stringify(next));
    window.dispatchEvent(new Event("r2:data"));
  } catch {
    // ignore storage quota failures
  }
}

export function readMetabolicSnapshot(
  date: string = todayKey(),
): MetabolicSnapshot | null {
  const p = getProfile();
  if (!profileComplete(p) || !p.sex) return null;

  const latestMeas = getLatestMeasurement();
  const kg = latestMeas?.weightKg ?? p.weightKg;
  if (typeof kg !== "number" || !Number.isFinite(kg) || kg <= 0) return null;
  const cm = p.heightCm as number;
  const age = p.age as number;

  const measurements = getAllMeasurements();
  const weightByDate = new Map<string, number>();
  for (const m of measurements) {
    if (
      m.date &&
      typeof m.weightKg === "number" &&
      Number.isFinite(m.weightKg) &&
      m.weightKg > 20
    ) {
      weightByDate.set(m.date, m.weightKg);
    }
  }

  const allMeals = getAllMeals();
  const mealsByDate = new Map<string, MealLog[]>();
  for (const meal of allMeals) {
    if (!meal.date) continue;
    const arr = mealsByDate.get(meal.date);
    if (arr) arr.push(meal);
    else mealsByDate.set(meal.date, [meal]);
  }

  const readBurn = burnReader();
  const cycleLen = p.metabolic?.cycleLengthDays ?? 28;
  const cycleEnabled =
    p.sex === "female" && Boolean(p.menstrualTrackingEnabled);
  const waistCm = latestMeas?.waistCm ?? null;
  const hipCm = latestMeas?.hipCm ?? null;

  const history: MetabolicHistoryDay[] = [];
  let runningKg = kg;
  for (let offset = 27; offset >= 0; offset--) {
    const d = shiftYmd(date, -offset);
    const w = weightByDate.get(d) ?? null;
    if (w !== null) runningKg = w;
    const dayMeals = mealsByDate.get(d) ?? [];
    const dayMacros = sumDayMacros(dayMeals);
    const dayBurn = readBurn(d);
    const dayHasWatch = dayBurn.source === "health" && dayBurn.total > 0;
    const dayBmr = precisionBmr({
      sex: p.sex,
      kg: w ?? runningKg,
      cm,
      age,
      waistCm,
      hipCm,
      metabolic: p.metabolic,
    }).bmr;
    const dayNeat = computeNeatFactor({
      metabolic: p.metabolic,
      fallbackActivity: p.activity,
      hasWatchActive: dayHasWatch,
    }).factor;
    const dayCycle = cycleMetabolicEffect(
      p.cycleStartDate ?? null,
      cycleEnabled,
      d,
      cycleLen,
    );
    history.push({
      date: d,
      weightKg: w,
      eatenKcal: dayMacros.kcal,
      activeKcal: dayBurn.total,
      formulaBaselineBurn: dayBmr * dayNeat + dayBmr * dayCycle.rmrPct,
      excludeFromSlope: dayCycle.active && dayCycle.excludeFromWeightSlope,
    });
  }

  const todayBurn = readBurn(date);
  const todayHasWatch = todayBurn.source === "health" && todayBurn.total > 0;
  const todayMacros = sumDayMacros(mealsByDate.get(date) ?? []);
  const sleepMap = getAllSleep();
  const sleepMin = sleepMap[date]?.durationMin ?? null;

  const snapshot = computeMetabolicSnapshot({
    sex: p.sex,
    goal: p.goal,
    kg,
    cm,
    age,
    waistCm,
    hipCm,
    metabolic: p.metabolic,
    fallbackActivity: p.activity,
    menstrualTrackingEnabled: p.menstrualTrackingEnabled,
    cycleStartDate: p.cycleStartDate ?? null,
    activeBurnDay: todayBurn.total,
    hasWatchActive: todayHasWatch,
    eatenToday: todayMacros,
    sleepMin,
    todayCondition: getTodayCondition(date),
    history,
    date,
  });

  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(
        scopedKey(METABOLIC_CACHE_KEY),
        JSON.stringify({
          date,
          adaptiveOffsetKcal: snapshot.adaptiveOffsetKcal,
          updatedAt: Date.now(),
        }),
      );
    } catch {
      // ignore storage errors
    }
  }

  return snapshot;
}
