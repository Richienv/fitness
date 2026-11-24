"use client";
// Reads everything today's energy balance needs from this device: the body
// profile and latest weight, what training burned (Apple Health or estimates),
// today's logged meals (for real-time per-meal weight impact) and today's target.
// The maths itself is in lib/energyBalance.
import { readBodyKg, readDayBurn } from "./burnData";
import { dayTarget } from "./dayBudgetData";
import {
  dayFractionCST,
  energyBalance,
  mealWeightImpact,
  weeksToGoal,
  type Balance,
  type BalanceInput,
  type MealWeightImpact,
} from "./energyBalance";
import { getIngredient, macrosFor } from "./ingredients";
import type { MealType } from "./presets";
import { getProfile, profileComplete } from "./settings";
import { getMealsForDate, isCustomItem } from "./store";
import { todayKey } from "./targets";
import { getWaterMl } from "./water";

export type MealImpactRow = {
  id: string;
  mealType: MealType;
  label: string;
  timeLabel: string;
  itemCount: number;
  kcal: number;
  grams: number;
  impact: MealWeightImpact;
};

export type EnergyView =
  | { status: "profile" }
  | {
      status: "ok";
      /** Inputs minus clock fraction so the UI can tick smoothly every second without hitting storage. */
      input: Omit<BalanceInput, "dayFraction">;
      balance: Balance;
      fromHealth: boolean;
      isToday: boolean;
      kg: number;
      targetKg: number | null;
      /** Weeks to the goal weight at today's pace, when that makes sense. */
      weeks: number | null;
      /** Real-time per-meal breakdown for today (or the viewed date), oldest first. */
      meals: MealImpactRow[];
      /** Known physical weight of food logged today (g), for honest scale explanation. */
      foodMassGrams: number;
      /** Drinking water logged today (ml). */
      waterMl: number;
    };

const MEAL_LABELS: Record<MealType, string> = {
  breakfast: "Sarapan",
  lunch: "Makan siang",
  snack: "Camilan",
  dinner: "Makan malam",
};

function cstTime(ms: number): string {
  return new Date(ms).toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Asia/Shanghai",
  });
}

export function readEnergyView(
  date: string,
  eatenKcal: number,
  targetKg: number | null,
  now: Date = new Date(),
): EnergyView {
  const p = getProfile();
  if (!profileComplete(p)) return { status: "profile" };
  const burn = readDayBurn(date);
  const kg = readBodyKg();
  const isToday = date === todayKey(now);
  const waterMl = getWaterMl(date);
  const baseInput: Omit<BalanceInput, "dayFraction"> = {
    sex: p.sex!,
    kg,
    cm: p.heightCm!,
    age: p.age!,
    eatenKcal,
    targetKcal: dayTarget(date, { burnKcal: burn.total }).target.kcal,
    activeKcal: burn.total,
    activeFromHealth: burn.source === "health",
    waterMl,
  };
  const balance = energyBalance({
    ...baseInput,
    dayFraction: isToday ? dayFractionCST(now) : 1,
  });
  if (!balance) return { status: "profile" };

  const dayMeals = getMealsForDate(date)
    .filter((m) => m.items.length > 0)
    .sort((a, b) => a.loggedAt - b.loggedAt);

  let runningBalance = balance.burnDay;
  let foodMassGrams = 0;
  const meals: MealImpactRow[] = dayMeals.map((m) => {
    let kcal = 0;
    let grams = 0;
    let latestAt = m.loggedAt;
    for (const item of m.items) {
      if (item.addedAt && item.addedAt > latestAt) latestAt = item.addedAt;
      if (isCustomItem(item)) {
        kcal += item.kcal;
        if (item.grams > 0) grams += item.grams;
      } else {
        kcal += macrosFor(item.id, item.qty).kcal;
        const ing = getIngredient(item.id);
        if (ing?.gramsPerUnit) grams += ing.gramsPerUnit * item.qty;
      }
    }
    foodMassGrams += grams;
    const impact = mealWeightImpact(kcal, balance.normal, runningBalance);
    runningBalance -= kcal;
    return {
      id: m.id,
      mealType: m.mealType,
      label: MEAL_LABELS[m.mealType],
      timeLabel: cstTime(latestAt),
      itemCount: m.items.length,
      kcal: Math.round(kcal),
      grams: Math.round(grams),
      impact,
    };
  });

  return {
    status: "ok",
    input: baseInput,
    balance,
    fromHealth: burn.source === "health",
    isToday,
    kg,
    targetKg,
    weeks: targetKg ? weeksToGoal(kg, targetKg, balance.bodyKgPerWeek) : null,
    meals,
    foodMassGrams: Math.round(foodMassGrams),
    waterMl,
  };
}
