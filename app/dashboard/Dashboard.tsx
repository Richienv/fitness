"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getIngredient, macrosFor } from "@/lib/ingredients";
import {
  dedupeMeals,
  getAllMeals,
  getDaily,
  getMealsForDate,
  isCustomItem,
  type MealItem,
  type MealLog,
} from "@/lib/store";
import { TARGETS, weekNumber } from "@/lib/targets";
import { useActiveDate, parseDate } from "@/lib/activeDate";
import {
  getAllWorkouts,
  getTodaysWorkout,
  recommendedSessionFor,
  getSession,
  workoutVolume,
  type WorkoutSession,
  type SessionType,
} from "@/lib/workouts";

const SESSION_ACCENT: Record<SessionType, string> = {
  PUSH_A: "#e8ff47",
  PUSH_B: "#e8ff47",
  PULL_A: "#47ffb8",
  PULL_B: "#47ffb8",
  LEGS:   "#ff6b35",
  CUSTOM: "#8b47ff",
};

type FullMacros = {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  sodium: number;
  sugar: number;
};

const ZERO: FullMacros = { kcal: 0, protein: 0, carbs: 0, fat: 0, sodium: 0, sugar: 0 };

function itemFullMacros(it: MealItem): FullMacros {
  if (isCustomItem(it)) {
    return {
      kcal: it.kcal,
      protein: it.protein,
      carbs: it.carbs,
      fat: it.fat,
      sodium: it.sodium ?? 0,
      sugar: it.sugar ?? 0,
    };
  }
  const m = macrosFor(it.id, it.qty);
  const ing = getIngredient(it.id);
  return {
    ...m,
    sodium: (ing?.sodium ?? 0) * it.qty,
    sugar: (ing?.sugar ?? 0) * it.qty,
  };
}

function sumItems(items: MealItem[]): FullMacros {
  return items.reduce<FullMacros>(
    (a, it) => {
      const m = itemFullMacros(it);
      return {
        kcal: a.kcal + m.kcal,
        protein: a.protein + m.protein,
        carbs: a.carbs + m.carbs,
        fat: a.fat + m.fat,
        sodium: a.sodium + m.sodium,
        sugar: a.sugar + m.sugar,
      };
    },
    { ...ZERO }
  );
}

function mondayOf(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const dow = x.getDay();
  x.setDate(x.getDate() + (dow === 0 ? -6 : 1 - dow));
  return x;
}

export default function Dashboard() {
  const { activeDate } = useActiveDate();
  const [meals, setMeals] = useState<MealLog[]>([]);
  const [allMeals, setAllMeals] = useState<MealLog[]>([]);
  const [gymDay, setGymDay] = useState(true);
  const [workouts, setWorkouts] = useState<WorkoutSession[]>([]);
  const [todayWorkout, setTodayWorkout] = useState<WorkoutSession | null>(null);

  useEffect(() => {
    dedupeMeals();
    setAllMeals(getAllMeals());
    setWorkouts(getAllWorkouts());
    document.body.classList.add("no-scroll");
    return () => document.body.classList.remove("no-scroll");
  }, []);

  useEffect(() => {
    if (!activeDate) return;
    setMeals(getMealsForDate(activeDate));
    const d = getDaily(activeDate);
    setGymDay(d.gymDay);
    setTodayWorkout(getTodaysWorkout(activeDate));
  }, [activeDate]);

  const totals = useMemo<FullMacros>(
    () =>
      meals.reduce<FullMacros>(
        (a, m) => {
          const s = sumItems(m.items);
          return {
            kcal: a.kcal + s.kcal,
            protein: a.protein + s.protein,
            carbs: a.carbs + s.carbs,
            fat: a.fat + s.fat,
            sodium: a.sodium + s.sodium,
            sugar: a.sugar + s.sugar,
          };
        },
        { ...ZERO }
      ),
    [meals]
  );

  const weekAvg = useMemo<FullMacros>(() => {
    if (!activeDate) return { ...ZERO };
    const now = parseDate(activeDate);
    const mon = mondayOf(now);
    const byDate = new Map<string, FullMacros>();
    for (const m of allMeals) {
      const d = parseDate(m.date);
      if (d < mon || d > now) continue;
      const cur = byDate.get(m.date) ?? { ...ZERO };
      const s = sumItems(m.items);
      byDate.set(m.date, {
        kcal: cur.kcal + s.kcal,
        protein: cur.protein + s.protein,
        carbs: cur.carbs + s.carbs,
        fat: cur.fat + s.fat,
        sodium: cur.sodium + s.sodium,
        sugar: cur.sugar + s.sugar,
      });
    }
    const days = byDate.size || 1;
    let acc = { ...ZERO };
    for (const v of byDate.values()) {
      acc = {
        kcal: acc.kcal + v.kcal,
        protein: acc.protein + v.protein,
        carbs: acc.carbs + v.carbs,
        fat: acc.fat + v.fat,
        sodium: acc.sodium + v.sodium,
        sugar: acc.sugar + v.sugar,
      };
    }
    return {
      kcal: Math.round(acc.kcal / days),
      protein: Math.round(acc.protein / days),
      carbs: Math.round(acc.carbs / days),
      fat: Math.round(acc.fat / days),
      sodium: Math.round(acc.sodium / days),
      sugar: Math.round(acc.sugar / days),
    };
  }, [allMeals, activeDate]);

  const wk = activeDate ? weekNumber(parseDate(activeDate)) : 1;
  const target = gymDay ? TARGETS.gymDay : TARGETS.restDay;

  const weekSessions = useMemo(() => {
    if (!activeDate) return [] as WorkoutSession[];
    const now = parseDate(activeDate);
    const mon = mondayOf(now);
    return workouts.filter((w) => {
      const d = parseDate(w.date);
      return d >= mon && d <= now && w.completed;
    });
  }, [workouts, activeDate]);

  const nextSessionType: SessionType = useMemo(
    () => (activeDate ? recommendedSessionFor(parseDate(activeDate)) : "PUSH_A"),
    [activeDate]
  );
  const nextSession = getSession(nextSessionType);

  const gymState: "done" | "rest" | "next" = todayWorkout
    ? "done"
    : !gymDay
    ? "rest"
    : "next";
  const gymLine1 = todayWorkout
    ? `${getSession(todayWorkout.sessionType)?.name ?? "SESSION"} DONE`
    : !gymDay
    ? "REST DAY"
    : `${nextSession?.name ?? ""} NEXT`;

  const gymLine2 = todayWorkout
    ? `${Math.round(workoutVolume(todayWorkout)).toLocaleString()}kg · ${todayWorkout.durationMin ?? 0} min`
    : `${weekSessions.length} sessions this week`;

  const summary = `${Math.round(totals.kcal)} kcal · ${Math.round(totals.protein)}g P · ${Math.round(totals.carbs)}g C · ${Math.round(totals.fat)}g F`;

  // sodium displayed in grams when it crosses 1000mg for compact UI.
  const sodiumDisplay = (mg: number) =>
    mg >= 1000 ? `${(mg / 1000).toFixed(1)}g` : `${Math.round(mg)}mg`;

  return (
    <main className="stats-hub">
      <header className="stats-hub-head">
        <div className="stats-hub-brand">
          <div className="home-brand">R2<span className="brand-dot">·</span>FIT</div>
          <div className="stats-hub-wk mono">WEEK {wk} / 12</div>
        </div>
        <div className="stats-hub-title">STATS</div>
      </header>

      <div className="stats-hub-summary mono">
        <span className="sh-label">TODAY AT A GLANCE</span>
        <span className="sh-value">{summary}</span>
      </div>

      <div className="stats-hub-grid">
        <Link href="/dashboard/today" className="stats-card accent">
          <div className="sc-label mono">TODAY</div>
          <div className="sc-num">{Math.round(totals.kcal).toLocaleString()}</div>
          <div className="sc-unit mono">
            kcal · {Math.round((totals.kcal / target.kcal) * 100)}%
          </div>
          <span className="sc-chev">›</span>
        </Link>

        <Link href="/dashboard/week" className="stats-card">
          <div className="sc-label mono">WEEK AVG</div>
          <div className="sc-num">{weekAvg.kcal.toLocaleString()}</div>
          <div className="sc-unit mono">avg kcal</div>
          <span className="sc-chev">›</span>
        </Link>

        <Link href="/dashboard/week" className="stats-card stats-card-multi">
          <div className="sc-label mono">MACROS · WEEK AVG</div>
          <div className="sc-multi">
            <div className="sc-multi-row">
              <span className="sc-multi-label mono">PROTEIN</span>
              <span className="sc-multi-val">{weekAvg.protein}<em>g</em></span>
            </div>
            <div className="sc-multi-row">
              <span className="sc-multi-label mono">CARBS</span>
              <span className="sc-multi-val">{weekAvg.carbs}<em>g</em></span>
            </div>
            <div className="sc-multi-row">
              <span className="sc-multi-label mono">FAT</span>
              <span className="sc-multi-val">{weekAvg.fat}<em>g</em></span>
            </div>
          </div>
          <span className="sc-chev">›</span>
        </Link>

        <Link href="/dashboard/week" className="stats-card stats-card-multi">
          <div className="sc-label mono">OTHERS · WEEK AVG</div>
          <div className="sc-multi">
            <div className="sc-multi-row">
              <span className="sc-multi-label mono">SODIUM</span>
              <span className="sc-multi-val">{sodiumDisplay(weekAvg.sodium)}</span>
            </div>
            <div className="sc-multi-row">
              <span className="sc-multi-label mono">SUGAR</span>
              <span className="sc-multi-val">{weekAvg.sugar}<em>g</em></span>
            </div>
            <div className="sc-multi-row">
              <span className="sc-multi-label mono">FIBER¹</span>
              <span className="sc-multi-val sc-multi-dim">—</span>
            </div>
          </div>
          <span className="sc-chev">›</span>
        </Link>
      </div>

      <div className="stats-hub-spacer" />

      <Link
        href="/dashboard/gym"
        className={`gym-card state-${gymState}`}
      >
        <div className="gc-left">
          <div className="gc-title mono">
            GYM SESSION{gymState === "done" && <span className="gc-check">✓</span>}
          </div>
          <div className="gc-sub">{gymLine2}</div>
        </div>
        <div className="gc-right">
          <span className="gc-status mono">{gymLine1}</span>
          <span className="gc-chev">›</span>
        </div>
      </Link>
    </main>
  );
}
