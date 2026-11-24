"use client";
// Reads everything today's energy balance needs from this device: the body
// profile and latest weight, what training burned (Apple Health or estimates)
// and today's target. The maths itself is in lib/energyBalance.
import { readBodyKg, readDayBurn } from "./burnData";
import { dayTarget } from "./dayBudgetData";
import { dayFractionCST, energyBalance, weeksToGoal, type Balance } from "./energyBalance";
import { getProfile, profileComplete } from "./settings";
import { todayKey } from "./targets";

export type EnergyView =
  | { status: "profile" }
  | {
      status: "ok";
      balance: Balance;
      fromHealth: boolean;
      isToday: boolean;
      kg: number;
      targetKg: number | null;
      /** Weeks to the goal weight at today's pace, when that makes sense. */
      weeks: number | null;
    };

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
  const balance = energyBalance({
    sex: p.sex!,
    kg,
    cm: p.heightCm!,
    age: p.age!,
    eatenKcal,
    targetKcal: dayTarget(date, { burnKcal: burn.total }).target.kcal,
    activeKcal: burn.total,
    activeFromHealth: burn.source === "health",
    dayFraction: isToday ? dayFractionCST(now) : 1,
  });
  if (!balance) return { status: "profile" };
  return {
    status: "ok",
    balance,
    fromHealth: burn.source === "health",
    isToday,
    kg,
    targetKg,
    weeks: targetKg ? weeksToGoal(kg, targetKg, balance.kgPerWeek) : null,
  };
}
