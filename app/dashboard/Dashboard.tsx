"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { macrosFor, type Macros } from "@/lib/ingredients";
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
};

const EMPTY: Macros = { kcal: 0, protein: 0, carbs: 0, fat: 0 };

function itemMacros(it: MealItem): Macros {
  if (isCustomItem(it)) {
    return { kcal: it.kcal, protein: it.protein, carbs: it.carbs, fat: it.fat };
  }
  return macrosFor(it.id, it.qty);
}
function sumItems(items: MealItem[]): Macros {
  return items.reduce<Macros>(
    (a, it) => {
      const m = itemMacros(it);
      return {
        kcal: a.kcal + m.kcal,
        protein: a.protein + m.protein,
        carbs: a.carbs + m.carbs,
        fat: a.fat + m.fat,
      };
    },
    { ...EMPTY }
  );
}

function mondayOf(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const dow = x.getDay();
  x.setDate(x.getDate() + (dow === 0 ? -6 : 1 - dow));
  return x;
}

const CHECKLIST_KEYS = ["water", "creatine", "protein", "gym", "whey", "sleep"] as const;

export default function Dashboard() {
  const { activeDate } = useActiveDate();
  const [meals, setMeals] = useState<MealLog[]>([]);
  const [allMeals, setAllMeals] = useState<MealLog[]>([]);
  const [gymDay, setGymDay] = useState(true);
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
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
    setChecklist(d.checklist ?? {});
    setTodayWorkout(getTodaysWorkout(activeDate));
  }, [activeDate]);

  const totals = useMemo<Macros>(
    () =>
      meals.reduce<Macros>(
        (a, m) => {
          const s = sumItems(m.items);
          return {
            kcal: a.kcal + s.kcal,
            protein: a.protein + s.protein,
            carbs: a.carbs + s.carbs,
            fat: a.fat + s.fat,
          };
        },
        { ...EMPTY }
      ),
    [meals]
  );

  const weekAvg = useMemo(() => {
    if (!activeDate) return { kcal: 0 };
    const now = parseDate(activeDate);
    const mon = mondayOf(now);
    const byDate = new Map<string, number>();
    for (const m of allMeals) {
      const d = parseDate(m.date);
      if (d < mon || d > now) continue;
      const s = sumItems(m.items);
      byDate.set(m.date, (byDate.get(m.date) ?? 0) + s.kcal);
    }
    const vals = Array.from(byDate.values());
    return {
      kcal: vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0,
    };
  }, [allMeals, activeDate]);

  const wk = activeDate ? weekNumber(parseDate(activeDate)) : 1;
  const target = gymDay ? TARGETS.gymDay : TARGETS.restDay;
  const checkedCount = CHECKLIST_KEYS.filter((k) => checklist[k]).length;

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
  const gymAccent =
    todayWorkout ? SESSION_ACCENT[todayWorkout.sessionType] : SESSION_ACCENT[nextSessionType];

  const gymLine1 = todayWorkout
    ? `${getSession(todayWorkout.sessionType)?.name ?? "SESSION"} DONE`
    : !gymDay
    ? "REST DAY"
    : `${nextSession?.name ?? ""} NEXT`;

  const gymLine2 = todayWorkout
    ? `${Math.round(workoutVolume(todayWorkout)).toLocaleString()}kg · ${todayWorkout.durationMin ?? 0} min`
    : `${weekSessions.length} sessions this week`;

  const summary = `${Math.round(totals.kcal)} kcal · ${Math.round(totals.protein)}g P · ${Math.round(totals.carbs)}g C`;

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
        </Link>

        <Link href="/dashboard/week" className="stats-card">
          <div className="sc-label mono">WEEK</div>
          <div className="sc-num">{weekAvg.kcal.toLocaleString()}</div>
          <div className="sc-unit mono">avg kcal</div>
        </Link>

        <Link href="/dashboard/checklist" className="stats-card">
          <div className="sc-label mono">CHECKLIST</div>
          <div className="sc-num">
            {checkedCount}/{CHECKLIST_KEYS.length}
          </div>
          <div className="sc-unit mono">done</div>
        </Link>

        <Link href="/dashboard/progress" className="stats-card">
          <div className="sc-label mono">PROGRESS</div>
          <div className="sc-num">WK {wk}/12</div>
          <div className="sc-unit mono">V-TAPER</div>
        </Link>
      </div>

      <Link
        href="/dashboard/gym"
        className={`gym-card state-${gymState}`}
        style={{ borderLeftColor: gymAccent }}
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
