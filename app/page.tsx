"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { macrosFor, type Macros } from "@/lib/ingredients";
import {
  dedupeMeals,
  getDaily,
  getMealsForDate,
  isCustomItem,
  setDaily,
  type MealItem,
  type MealLog,
} from "@/lib/store";
import { TARGETS, todayKey, weekNumber } from "@/lib/targets";
import {
  getSession,
  getTodaysWorkout,
  recommendedSessionFor,
  workoutVolume,
  type WorkoutSession,
} from "@/lib/workouts";

const EMPTY: Macros = { kcal: 0, protein: 0, carbs: 0, fat: 0 };

function sumMealItems(items: MealItem[]): Macros {
  return items.reduce<Macros>(
    (a, it) => {
      const m = isCustomItem(it)
        ? { kcal: it.kcal, protein: it.protein, carbs: it.carbs, fat: it.fat }
        : macrosFor(it.id, it.qty);
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

function greetingForHour(h: number): string {
  if (h >= 6 && h < 11) return "GOOD MORNING.";
  if (h >= 11 && h < 17) return "KEEP GOING.";
  if (h >= 17 && h < 21) return "ALMOST DONE.";
  return "WIND DOWN.";
}

function workoutSubtitle(
  session: WorkoutSession | null,
  isRestDay: boolean,
  recommendedLabel: string
): string {
  if (session) {
    const vol = Math.round(workoutVolume(session));
    const name = session.sessionType === "CUSTOM"
      ? session.customName ?? "Custom"
      : getSession(session.sessionType)?.name ?? session.sessionType;
    return `✓ ${name} done · ${vol.toLocaleString()}kg volume`;
  }
  if (isRestDay) return "Rest day — recovery";
  return `${recommendedLabel} recommended today`;
}

function mealSubtitle(logged: Set<string>, hour: number, totalKcal: number): string {
  const all = logged.size === 4;
  if (all) return `✓ All meals logged · ${Math.round(totalKcal).toLocaleString()} kcal`;
  if (hour < 11) {
    if (!logged.has("breakfast")) return "Breakfast not logged yet";
    return "Lunch coming up";
  }
  if (hour < 14) {
    if (!logged.has("lunch")) return "Lunch not logged yet";
    return "Snack coming up";
  }
  if (hour < 17) {
    if (!logged.has("snack")) return "Snack not logged · Dinner coming up";
    return "Dinner coming up";
  }
  if (!logged.has("dinner")) return "Dinner not logged yet";
  return "Wrap up your day";
}

function Ring({
  pct,
  color,
  centerTop,
  centerBottom,
  label,
  complete,
  muted,
}: {
  pct: number;
  color: string;
  centerTop: string;
  centerBottom?: string;
  label: string;
  complete?: boolean;
  muted?: boolean;
}) {
  const size = 90;
  const stroke = 7;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  const offset = c - (clamped / 100) * c;
  return (
    <div className={`home-ring${complete ? " complete" : ""}`}>
      <div className="home-ring-wrap" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="#222222"
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={muted ? "#444444" : color}
            strokeWidth={stroke}
            strokeDasharray={c}
            strokeDashoffset={offset}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ transition: "stroke-dashoffset 0.8s ease" }}
          />
        </svg>
        <div className="home-ring-center">
          <div className="home-ring-num" style={{ color: muted ? "var(--muted)" : color }}>
            {centerTop}
          </div>
          {centerBottom && <div className="home-ring-unit">{centerBottom}</div>}
        </div>
      </div>
      <div className="home-ring-label mono">{label}</div>
    </div>
  );
}

export default function HomePage() {
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [meals, setMeals] = useState<MealLog[]>([]);
  const [workout, setWorkout] = useState<WorkoutSession | null>(null);
  const [gymDay, setGymDay] = useState(true);

  useEffect(() => {
    setMounted(true);
    dedupeMeals();
    const today = todayKey();
    setMeals(getMealsForDate(today));
    setWorkout(getTodaysWorkout(today));
    setGymDay(getDaily(today).gymDay);
    const t = setInterval(() => setNow(new Date()), 60_000);
    document.body.classList.add("no-scroll");
    return () => {
      clearInterval(t);
      document.body.classList.remove("no-scroll");
    };
  }, []);

  const week = weekNumber();
  const hour = now.getHours();
  const greeting = greetingForHour(hour);

  const totals: Macros = useMemo(
    () =>
      meals.reduce<Macros>(
        (a, m) => {
          const s = sumMealItems(m.items);
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

  const target = gymDay ? TARGETS.gymDay : TARGETS.restDay;
  const kcalPct = Math.round((totals.kcal / target.kcal) * 100);
  const kcalLeft = Math.max(0, target.kcal - totals.kcal);
  const kcalComplete = totals.kcal >= target.kcal;

  const proteinPct = Math.round((totals.protein / target.protein) * 100);
  const proteinLeft = Math.max(0, Math.round(target.protein - totals.protein));
  const proteinComplete = totals.protein >= target.protein;

  const workoutDone = !!workout;
  const workoutPct = gymDay ? (workoutDone ? 100 : 0) : 0;

  const loggedTypes = useMemo(() => new Set(meals.map((m) => m.mealType)), [meals]);

  const recommendedLabel = useMemo(() => {
    const id = recommendedSessionFor(now);
    return getSession(id)?.name ?? id;
  }, [now]);

  const isRestDay = !gymDay;

  function toggleGym(next: boolean) {
    if (next === gymDay) return;
    setGymDay(next);
    const today = todayKey();
    const cur = getDaily(today);
    setDaily({ date: today, gymDay: next, checklist: cur.checklist ?? {} });
  }

  const dateLine = now
    .toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric" })
    .toUpperCase();
  const timeLine = now
    .toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    .toUpperCase();

  const dayShort = now
    .toLocaleDateString("en", { weekday: "short" })
    .toUpperCase();
  const quickStats = mounted
    ? `${dayShort} · ${gymDay ? "GYM DAY" : "REST DAY"} · ${Math.round(
        totals.kcal
      ).toLocaleString()} / ${target.kcal.toLocaleString()} KCAL · ${Math.round(
        totals.protein
      )}G P`
    : "";

  return (
    <main className="home">
      <header className="home-header">
        <div className="home-header-row">
          <div className="home-brand">R2<span className="brand-dot">·</span>FIT</div>
          <div className="home-week mono">WEEK {week} / 12</div>
        </div>
        <div className="home-datetime mono">
          {dateLine} · {timeLine}
        </div>
        {mounted && <div className="home-quickstats mono">{quickStats}</div>}
      </header>

      <section className="home-visual">
        <div className="home-greeting">{greeting}</div>
        <div className="home-rings">
          <Ring
            pct={kcalPct}
            color="#e8ff47"
            centerTop={kcalComplete ? "✓" : Math.round(kcalLeft).toLocaleString()}
            centerBottom={kcalComplete ? undefined : "kcal left"}
            label="KCAL LEFT"
            complete={kcalComplete}
          />
          <Ring
            pct={proteinPct}
            color="#47ffb8"
            centerTop={proteinComplete ? "✓" : `${proteinLeft}g`}
            centerBottom={proteinComplete ? undefined : "left"}
            label="PROTEIN LEFT"
            complete={proteinComplete}
          />
          <Ring
            pct={workoutPct}
            color="#ffffff"
            centerTop={!gymDay ? "REST" : workoutDone ? "✓" : "0/1"}
            centerBottom={!gymDay ? undefined : workoutDone ? undefined : "sessions"}
            label="SESSION"
            complete={gymDay && workoutDone}
            muted={!gymDay}
          />
        </div>
      </section>

      <nav className="home-actions">
        <div className="home-daytoggle mono" role="tablist" aria-label="Day type">
          <button
            type="button"
            className={`home-daytoggle-btn${gymDay ? " on" : ""}`}
            onClick={() => toggleGym(true)}
            role="tab"
            aria-selected={gymDay}
          >
            🏋️ GYM DAY
          </button>
          <button
            type="button"
            className={`home-daytoggle-btn${!gymDay ? " on" : ""}`}
            onClick={() => toggleGym(false)}
            role="tab"
            aria-selected={!gymDay}
          >
            🌙 REST DAY
          </button>
        </div>

        <div className="home-duo">
          <Link href="/workout" className="home-duo-btn home-duo-workout">
            <span className="home-duo-icon">🏋️</span>
            <span className="home-duo-title">WORKOUT</span>
            <span className="home-duo-sub mono">
              {workoutSubtitle(workout, isRestDay, recommendedLabel)}
            </span>
          </Link>

          <Link href="/meal" className="home-duo-btn home-duo-meal">
            <span className="home-duo-icon">🍽️</span>
            <span className="home-duo-title">MEAL</span>
            <span className="home-duo-sub mono">
              {mealSubtitle(loggedTypes, hour, totals.kcal)}
            </span>
          </Link>
        </div>
      </nav>
    </main>
  );
}
