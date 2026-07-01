"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { macrosFor, type Macros } from "@/lib/ingredients";
import { dedupeMeals, getAllMeals, isCustomItem, type MealItem, type MealLog } from "@/lib/store";
import WeeklyGraph from "../../meal/WeeklyGraph";
import MicroWeekGrid, { type MicroDay, type MicroSeriesDef } from "../../_motion/MicroWeekGrid";
import { useActiveDate, parseDate } from "@/lib/activeDate";
import { getAllWorkouts, weekNumber } from "@/lib/workouts";
import { renderWeeklyCard, shareBlob } from "@/lib/shareCards";
import { sumNutrition } from "@/lib/nutritionStats";
import { TARGETS } from "@/lib/targets";
import { getMicroTargets } from "@/lib/nutritionTargets";

const EMPTY: Macros = { kcal: 0, protein: 0, carbs: 0, fat: 0 };

function sumItems(items: MealItem[]): Macros {
  return items.reduce<Macros>((a, it) => {
    const m = isCustomItem(it)
      ? { kcal: it.kcal, protein: it.protein, carbs: it.carbs, fat: it.fat }
      : macrosFor(it.id, it.qty);
    return {
      kcal: a.kcal + m.kcal,
      protein: a.protein + m.protein,
      carbs: a.carbs + m.carbs,
      fat: a.fat + m.fat,
    };
  }, { ...EMPTY });
}

function mondayOf(d: Date, offsetWeeks = 0): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const dow = x.getDay();
  x.setDate(x.getDate() + (dow === 0 ? -6 : 1 - dow) + offsetWeeks * 7);
  return x;
}

function fmt(d: Date): string {
  return d.toLocaleDateString("en", { month: "short", day: "numeric" }).toUpperCase();
}

export default function WeekPage() {
  const { activeDate } = useActiveDate();
  const [allMeals, setAllMeals] = useState<MealLog[]>([]);
  const [offset, setOffset] = useState(0);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    dedupeMeals();
    setAllMeals(getAllMeals());
    document.body.classList.add("no-scroll");
    return () => document.body.classList.remove("no-scroll");
  }, []);

  const now = useMemo(() => (activeDate ? parseDate(activeDate) : new Date()), [activeDate]);
  const monday = useMemo(() => mondayOf(now, offset), [now, offset]);
  const sunday = useMemo(() => {
    const d = new Date(monday);
    d.setDate(d.getDate() + 6);
    return d;
  }, [monday]);

  const weekMeals = useMemo(
    () =>
      allMeals.filter((m) => {
        const d = parseDate(m.date);
        return d >= monday && d <= sunday;
      }),
    [allMeals, monday, sunday]
  );

  const stats = useMemo(() => {
    const byDate = new Map<string, Macros>();
    for (const m of weekMeals) {
      const s = sumItems(m.items);
      const cur = byDate.get(m.date) ?? { ...EMPTY };
      byDate.set(m.date, {
        kcal: cur.kcal + s.kcal,
        protein: cur.protein + s.protein,
        carbs: cur.carbs + s.carbs,
        fat: cur.fat + s.fat,
      });
    }
    const days = Array.from(byDate.values());
    const avgKcal = days.length ? Math.round(days.reduce((a, b) => a + b.kcal, 0) / days.length) : 0;
    const avgProtein = days.length ? Math.round(days.reduce((a, b) => a + b.protein, 0) / days.length) : 0;

    const workouts = getAllWorkouts().filter((w) => {
      if (!w.completed) return false;
      const d = new Date(w.startedAt);
      return d >= monday && d <= sunday;
    });
    let bestName = "—";
    let bestDetail = "—";
    let bestScore = 0;
    for (const w of workouts) {
      for (const ex of w.exercises) {
        for (const s of ex.sets) {
          const score = s.weight * s.reps;
          if (score > bestScore) {
            bestScore = score;
            bestName = ex.exerciseName;
            bestDetail = `${s.weight}kg × ${s.reps}`;
          }
        }
      }
    }
    return {
      avgKcal,
      avgProtein,
      sessions: workouts.length,
      bestName,
      bestDetail,
    };
  }, [weekMeals, monday, sunday]);

  const microTargets = useMemo(() => getMicroTargets(), []);

  // Per-day full-nutrition for the 7-day micro grid. Mon..Sun.
  const microDays = useMemo<MicroDay[]>(() => {
    const out: MicroDay[] = [];
    const letters = ["M", "T", "W", "T", "F", "S", "S"];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(d.getDate() + i);
      const key =
        d.getFullYear().toString().padStart(4, "0") +
        "-" + String(d.getMonth() + 1).padStart(2, "0") +
        "-" + String(d.getDate()).padStart(2, "0");
      const dayMeals = weekMeals.filter((m) => m.date === key);
      const n = sumNutrition(dayMeals);
      out.push({
        date: key,
        letter: letters[i],
        values: {
          protein: n.protein,
          fiber: n.fiber,
          omega3: n.omega3,
          k: n.k,
          mg: n.mg,
          fe: n.fe,
          zn: n.zn,
          ca: n.ca,
          sugar: n.sugar,
          na: n.na,
        },
      });
    }
    return out;
  }, [monday, weekMeals]);

  const microSeries = useMemo<MicroSeriesDef[]>(() => [
    { key: "protein", label: "PROTEIN",   short: "PRO", unit: "g",  target: TARGETS.gymDay.protein, kind: "hit", color: "#ff8a3d" },
    { key: "fiber",   label: "FIBER",     short: "FIB", unit: "g",  target: microTargets.fiber,    kind: "hit", color: "#22c55e" },
    { key: "omega3",  label: "OMEGA-3",   short: "ω3",  unit: "g",  target: microTargets.omega3,   kind: "hit", color: "#22c55e" },
    { key: "k",       label: "POTASSIUM", short: "K",   unit: "mg", target: microTargets.k,        kind: "hit", color: "#ff8a3d" },
    { key: "mg",      label: "MAGNESIUM", short: "MG",  unit: "mg", target: microTargets.mg,       kind: "hit", color: "#ff8a3d" },
    { key: "fe",      label: "IRON",      short: "FE",  unit: "mg", target: microTargets.fe,       kind: "hit", color: "#ff6b35" },
    { key: "zn",      label: "ZINC",      short: "ZN",  unit: "mg", target: microTargets.zn,       kind: "hit", color: "#479dff" },
    { key: "ca",      label: "CALCIUM",   short: "CA",  unit: "mg", target: microTargets.ca,       kind: "hit", color: "#f0f0f0" },
    { key: "sugar",   label: "SUGAR",     short: "SUG", unit: "g",  target: microTargets.sugar,    kind: "cap", color: "#ff4747" },
    { key: "na",      label: "SODIUM",    short: "NA",  unit: "mg", target: microTargets.na,       kind: "cap", color: "#ff4747" },
  ], [microTargets]);

  const wk = weekNumber(monday);

  async function handleShare() {
    setSharing(true);
    try {
      const dateRange = `${fmt(monday)}–${fmt(sunday)}, ${monday.getFullYear()}`;
      const blob = await renderWeeklyCard({
        week: wk,
        sessionsDone: stats.sessions,
        sessionsTarget: 5,
        avgKcal: stats.avgKcal,
        avgProtein: stats.avgProtein,
        bestLiftName: stats.bestName,
        bestLiftDetail: stats.bestDetail,
        weeksToGo: Math.max(0, 12 - wk),
        dateRange,
      });
      await shareBlob(blob, `r2fit-week-${wk}.png`, `Week ${wk} in the books.`);
    } finally {
      setSharing(false);
    }
  }

  return (
    <main className="sub-page">
      <header className="sub-head">
        <Link href="/dashboard" className="sub-back">← STATS</Link>
        <div className="sub-title">THIS WEEK</div>
        <div className="sub-sub mono">{fmt(monday)}–{fmt(sunday)}</div>
      </header>

      <div className="week-chart">
        <WeeklyGraph meals={allMeals} now={monday} />
      </div>

      <MicroWeekGrid days={microDays} series={microSeries} />

      <div className="week-stats-row">
        <div className="week-stat">
          <div className="ws-num">{stats.sessions}/5</div>
          <div className="ws-label mono">SESSIONS</div>
        </div>
        <div className="week-stat">
          <div className="ws-num">{stats.avgKcal.toLocaleString()}</div>
          <div className="ws-label mono">AVG KCAL</div>
        </div>
        <div className="week-stat">
          <div className="ws-num">{stats.avgProtein}G</div>
          <div className="ws-label mono">AVG PROTEIN</div>
        </div>
      </div>

      <div className="week-nav">
        <button type="button" className="week-nav-btn mono" onClick={() => setOffset((o) => o - 1)}>
          ← PREV WEEK
        </button>
        <button
          type="button"
          className="week-nav-btn mono"
          onClick={() => setOffset((o) => o + 1)}
          disabled={offset >= 0}
        >
          NEXT →
        </button>
      </div>

      <button type="button" className="share-btn" onClick={handleShare} disabled={sharing}>
        {sharing ? "GENERATING…" : "📤 SHARE WEEK"}
      </button>
    </main>
  );
}
