"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { macrosFor, type Macros } from "@/lib/ingredients";
import { PRESETS, type MealType } from "@/lib/presets";
import { getAllMeals, getDaily, isCustomItem, type MealLog } from "@/lib/store";
import { TARGETS, todayKey, weekNumber } from "@/lib/targets";
import WeeklyGraph from "./WeeklyGraph";

type MealInfo = {
  id: MealType;
  emoji: string;
  name: string;
  windowStart: number;
  windowEnd: number;
  expectedKcal: number;
};

const MEALS: MealInfo[] = [
  { id: "breakfast", emoji: "🌅", name: "BREAKFAST", windowStart: 6,  windowEnd: 10, expectedKcal: 350 },
  { id: "lunch",     emoji: "☀️", name: "LUNCH",     windowStart: 11, windowEnd: 14, expectedKcal: 700 },
  { id: "snack",     emoji: "🍎", name: "SNACK",     windowStart: 14, windowEnd: 17, expectedKcal: 250 },
  { id: "dinner",    emoji: "🌙", name: "DINNER",    windowStart: 17, windowEnd: 21, expectedKcal: 700 },
];

const EMPTY_MACROS: Macros = { kcal: 0, protein: 0, carbs: 0, fat: 0 };

function sumMealMacros(meal: MealLog): Macros {
  return meal.items.reduce<Macros>((acc, it) => {
    if (isCustomItem(it)) {
      return {
        kcal: acc.kcal + it.kcal,
        protein: acc.protein + it.protein,
        carbs: acc.carbs + it.carbs,
        fat: acc.fat + it.fat,
      };
    }
    const m = macrosFor(it.id, it.qty);
    return {
      kcal: acc.kcal + m.kcal,
      protein: acc.protein + m.protein,
      carbs: acc.carbs + m.carbs,
      fat: acc.fat + m.fat,
    };
  }, EMPTY_MACROS);
}

function addMacros(a: Macros, b: Macros): Macros {
  return {
    kcal: a.kcal + b.kcal,
    protein: a.protein + b.protein,
    carbs: a.carbs + b.carbs,
    fat: a.fat + b.fat,
  };
}

type MealBucket = { macros: Macros; items: number };

export default function MealHome() {
  const [allMeals, setAllMeals] = useState<MealLog[]>([]);
  const [now, setNow] = useState<Date | null>(null);
  const [gymDay, setGymDay] = useState(false);

  useEffect(() => {
    setAllMeals(getAllMeals());
    setNow(new Date());
    setGymDay(getDaily(todayKey()).gymDay);
  }, []);

  const today = todayKey();
  const todayMeals = useMemo(() => allMeals.filter((m) => m.date === today), [allMeals, today]);

  const byType = useMemo(() => {
    const m: Record<MealType, MealBucket> = {
      breakfast: { macros: { ...EMPTY_MACROS }, items: 0 },
      lunch:     { macros: { ...EMPTY_MACROS }, items: 0 },
      snack:     { macros: { ...EMPTY_MACROS }, items: 0 },
      dinner:    { macros: { ...EMPTY_MACROS }, items: 0 },
    };
    for (const meal of todayMeals) {
      m[meal.mealType].macros = addMacros(m[meal.mealType].macros, sumMealMacros(meal));
      m[meal.mealType].items += meal.items.length;
    }
    return m;
  }, [todayMeals]);

  const totals = useMemo<Macros>(() => {
    return (Object.values(byType) as MealBucket[]).reduce(
      (a, b) => addMacros(a, b.macros),
      EMPTY_MACROS
    );
  }, [byType]);

  const target = gymDay ? TARGETS.gymDay : TARGETS.restDay;
  const wk = now ? weekNumber(now) : 1;

  const currentHour = now?.getHours() ?? -1;
  const activeMeal: MealType | null =
    currentHour >= 6 && currentHour < 11 ? "breakfast" :
    currentHour >= 11 && currentHour < 14 ? "lunch" :
    currentHour >= 14 && currentHour < 17 ? "snack" :
    currentHour >= 17 && currentHour < 22 ? "dinner" : null;

  const dateStr = now
    ? now.toLocaleDateString("en", { weekday: "short", day: "numeric", month: "short" }).toUpperCase()
    : "";

  const bars: { key: keyof Macros; label: string; unit: string }[] = [
    { key: "kcal",    label: "CALORIES", unit: "" },
    { key: "protein", label: "PROTEIN",  unit: "g" },
    { key: "carbs",   label: "CARBS",    unit: "g" },
    { key: "fat",     label: "FAT",      unit: "g" },
  ];

  return (
    <main className="meal-home">
      <div className="meal-home-top">
        <Link href="/" className="back-link">← Back</Link>

        <div className="mh-header">
          <div className="mh-header-row">
            <h1 className="mh-title">🍽️ LOG <span>MEAL</span></h1>
            <div className="mh-date mono">{dateStr}</div>
          </div>
          <div className="mh-subtitle mono">
            WK {wk} / 12 · {gymDay ? "GYM DAY" : "REST DAY"} · {target.kcal.toLocaleString()} kcal target
          </div>
        </div>

        <WeeklyGraph meals={allMeals} now={now} />

        <div className="today-card">
          <div className="today-head">
            <div className="today-label">TODAY&apos;S PROGRESS</div>
            <div className="today-tag mono">{gymDay ? "GYM" : "REST"}</div>
          </div>
          <div className="today-bars">
            {bars.map((b) => {
              const val = Math.round(totals[b.key]);
              const tgt = target[b.key];
              const pct = Math.min(100, Math.round((val / tgt) * 100));
              const left = Math.max(0, Math.round(tgt - val));
              return (
                <div key={b.key} className="tbar-row">
                  <div className="tbar-label mono">{b.label}</div>
                  <div className="tbar-nums mono">
                    <span className="tbar-val">{val.toLocaleString()}</span>
                    <span className="tbar-sep"> / </span>
                    <span className="tbar-tgt">{tgt.toLocaleString()}{b.unit}</span>
                  </div>
                  <div className="tbar-track">
                    <div className="tbar-fill" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="tbar-foot mono">
                    <span className="tbar-pct">{pct}%</span>
                    <span className="tbar-left">{left}{b.unit} left</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="quick-section">
          <div className="quick-label">⚡ QUICK LOG</div>
          <div className="quick-scroll-wrap">
            <div className="quick-row">
              {PRESETS.map((p) => (
                <Link
                  key={p.id}
                  href={`/meal/confirm?preset=${p.id}`}
                  className="quick-chip"
                >
                  {p.label}
                </Link>
              ))}
            </div>
            <div className="quick-fade" />
          </div>
          <div className="quick-dots">
            {PRESETS.map((p, i) => (
              <span key={p.id} className={`quick-dot${i === 0 ? " on" : ""}`} />
            ))}
          </div>
        </div>

        <div className="meal-stack">
          {MEALS.map((m) => {
            const bucket = byType[m.id];
            const logged = bucket.macros.kcal > 0;
            const isActive = activeMeal === m.id;
            return (
              <div
                key={m.id}
                className={`meal-row${isActive ? " active" : ""}${logged ? " logged" : ""}`}
              >
                <Link href={`/meal/${m.id}`} className="meal-row-body">
                  <span className="meal-emoji">{m.emoji}</span>
                  <div className="meal-row-main">
                    <div className="meal-row-name">{m.name}</div>
                    {logged ? (
                      <div className="meal-row-stats mono">
                        ✓ {Math.round(bucket.macros.kcal).toLocaleString()} kcal ·{" "}
                        {Math.round(bucket.macros.protein)}g protein · {bucket.items} items
                      </div>
                    ) : (
                      <div className="meal-row-stats mono">
                        TAP TO LOG · ~{m.expectedKcal} kcal expected
                      </div>
                    )}
                  </div>
                </Link>
                {logged && (
                  <div className="meal-row-actions">
                    <Link href={`/meal/${m.id}`} className="mr-btn">VIEW</Link>
                    <Link href={`/meal/${m.id}`} className="mr-btn primary">+ ADD</Link>
                  </div>
                )}
                {!logged && <span className="meal-chev">›</span>}
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
