"use client";
// Browser connector for lib/progressAnalytics.ts: aggregates local meals,
// measurements, workouts, activities, Apple Health, and water into day-by-day
// rows + a live "kalau gini terus" trajectory projection.
import { burnReader, readBodyKg } from "./burnData";
import { sumNutrition } from "./nutritionStats";
import { getMicroTargets } from "./nutritionTargets";
import { getAllMeasurements } from "./measurements";
import {
  buildDailyProgressRows,
  buildProgressProjection,
  type DailyProgressInput,
  type DailyProgressRow,
  type ProgressProjection,
} from "./progressAnalytics";
import { getProfile, profileComplete } from "./settings";
import { getAllMeals } from "./store";
import { TARGETS, todayKey } from "./targets";
import { getAllWater } from "./water";
import { getAllWorkouts } from "./workouts";
import { getAllActivities } from "./activity";
import { getAllHealthDays } from "./health";
import { readCompanion } from "./companionSettings";

export type ProgressTargets = {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  sugarCapG: number;
};

export type ProgressInsightsData = {
  today: string;
  rows: DailyProgressRow[];
  projection: ProgressProjection | null;
  anchorKg: number;
  targetKg: number | null;
  targets: ProgressTargets;
};

export function readProgressInsights(userName?: string | null): ProgressInsightsData {
  const today = todayKey();
  const profile = getProfile();
  const anchorKg = readBodyKg();
  const companion = readCompanion(userName);
  const targetKg =
    companion.goal?.mode === "weight" && companion.goal.targetWeight
      ? companion.goal.targetWeight
      : null;

  const baseTarget = TARGETS.gymDay;
  const microTargets = getMicroTargets();
  const targets: ProgressTargets = {
    kcal: baseTarget.kcal,
    proteinG: baseTarget.protein,
    carbsG: baseTarget.carbs,
    fatG: baseTarget.fat,
    sugarCapG: microTargets.sugar > 0 ? microTargets.sugar : 30,
  };

  const meals = getAllMeals();
  const measurements = getAllMeasurements();
  const workouts = getAllWorkouts();
  const activities = getAllActivities();
  const healthDays = getAllHealthDays();
  const waterMap = getAllWater();
  const readBurn = burnReader();

  // Gather every unique date that has any entered data (plus today).
  const dates = new Set<string>([today]);
  for (const m of meals) if (m.date && m.items.length > 0) dates.add(m.date);
  for (const r of measurements) if (r.date && r.weightKg) dates.add(r.date);
  for (const w of workouts)
    if (w.date && w.exercises.some((e) => e.sets.length > 0)) dates.add(w.date);
  for (const a of activities) if (a.date) dates.add(a.date);
  for (const d of Object.keys(healthDays)) dates.add(d);
  for (const d of Object.keys(waterMap)) if (waterMap[d] > 0) dates.add(d);

  // Pre-index meals by date using sumNutrition so custom items & library macros stay aligned.
  const mealsByDate = new Map<
    string,
    {
      kcal: number;
      protein: number;
      carbs: number;
      fat: number;
      sugar: number;
      fiber: number;
      sodium: number;
      count: number;
    }
  >();
  for (const m of meals) {
    if (!m.date || m.items.length === 0) continue;
    const acc = mealsByDate.get(m.date) ?? {
      kcal: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      sugar: 0,
      fiber: 0,
      sodium: 0,
      count: 0,
    };
    acc.count += 1;
    const n = sumNutrition([m]);
    acc.kcal += Number.isFinite(n.kcal) ? n.kcal : 0;
    acc.protein += Number.isFinite(n.protein) ? n.protein : 0;
    acc.carbs += Number.isFinite(n.carbs) ? n.carbs : 0;
    acc.fat += Number.isFinite(n.fat) ? n.fat : 0;
    acc.sugar += Number.isFinite(n.sugar) ? n.sugar : 0;
    acc.fiber += Number.isFinite(n.fiber) ? n.fiber : 0;
    acc.sodium += Number.isFinite(n.na) ? n.na : 0;
    mealsByDate.set(m.date, acc);
  }

  const weightByDate = new Map<string, number>();
  for (const r of measurements) {
    if (r.date && typeof r.weightKg === "number" && r.weightKg > 20) {
      weightByDate.set(r.date, r.weightKg);
    }
  }

  const inputs: DailyProgressInput[] = [];
  for (const date of dates) {
    const meal = mealsByDate.get(date);
    const burn = readBurn(date);
    inputs.push({
      date,
      weightKg: weightByDate.get(date) ?? null,
      kcalIn: meal?.kcal ?? 0,
      proteinG: meal?.protein ?? 0,
      carbsG: meal?.carbs ?? 0,
      fatG: meal?.fat ?? 0,
      sugarG: meal?.sugar ?? 0,
      fiberG: meal?.fiber ?? 0,
      sodiumMg: meal?.sodium ?? 0,
      mealCount: meal?.count ?? 0,
      activeBurnKcal: burn.total,
      activeFromHealth: burn.source === "health",
      workoutCount: burn.gym.length + burn.activities.length,
      waterMl: waterMap[date] ?? 0,
    });
  }

  const profileInput =
    profileComplete(profile) && profile.sex && profile.heightCm && profile.age
      ? {
          sex: profile.sex,
          cm: profile.heightCm,
          age: profile.age,
          fallbackKg: anchorKg,
        }
      : null;

  const rows = buildDailyProgressRows(inputs, profileInput).slice(0, 180);
  const projection = buildProgressProjection(rows, anchorKg, targetKg, today);

  return { today, rows, projection, anchorKg, targetKg, targets };
}
