"use client";
// Browser connector for lib/progressAnalytics.ts: aggregates local meals,
// measurements, workouts, activities, Apple Health, and water into day-by-day
// rows + a live "kalau gini terus" trajectory projection.
import { burnReader, readBodyKg } from "./burnData";
import { macrosFor } from "./ingredients";
import { getAllMeasurements } from "./measurements";
import {
  buildDailyProgressRows,
  buildProgressProjection,
  type DailyProgressInput,
  type DailyProgressRow,
  type ProgressProjection,
} from "./progressAnalytics";
import { getProfile, profileComplete } from "./settings";
import { getAllMeals, isCustomItem } from "./store";
import { todayKey } from "./targets";
import { getAllWater } from "./water";
import { getAllWorkouts } from "./workouts";
import { getAllActivities } from "./activity";
import { getAllHealthDays } from "./health";
import { readCompanion } from "./companionSettings";

export type ProgressInsightsData = {
  today: string;
  rows: DailyProgressRow[];
  projection: ProgressProjection | null;
  anchorKg: number;
  targetKg: number | null;
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

  // Pre-index meals & measurements by date so we only loop once.
  const mealsByDate = new Map<
    string,
    { kcal: number; protein: number; carbs: number; fat: number; count: number }
  >();
  for (const m of meals) {
    if (!m.date || m.items.length === 0) continue;
    const acc = mealsByDate.get(m.date) ?? {
      kcal: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      count: 0,
    };
    acc.count += 1;
    for (const item of m.items) {
      if (isCustomItem(item)) {
        acc.kcal += item.kcal || 0;
        acc.protein += item.protein || 0;
        acc.carbs += item.carbs || 0;
        acc.fat += item.fat || 0;
      } else {
        const mac = macrosFor(item.id, item.qty);
        acc.kcal += mac.kcal;
        acc.protein += mac.protein;
        acc.carbs += mac.carbs;
        acc.fat += mac.fat;
      }
    }
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

  const rows = buildDailyProgressRows(inputs, profileInput).slice(0, 60);
  const projection = buildProgressProjection(rows, anchorKg, targetKg, today);

  return { today, rows, projection, anchorKg, targetKg };
}
