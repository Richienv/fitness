"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { macrosFor, type Macros } from "@/lib/ingredients";
import { PRESETS, type MealType } from "@/lib/presets";
import {
  clearMealsForDate,
  dedupeMeals,
  getAllMeals,
  getDaily,
  isCustomItem,
  type MealLog,
} from "@/lib/store";
import { TARGETS, weekNumber } from "@/lib/targets";
import { useActiveDate, parseDate } from "@/lib/activeDate";
import WeeklyGraph from "./WeeklyGraph";
import DatePicker from "./DatePicker";

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
  const {
    activeDate,
    setActiveDate,
    goPrevDay,
    goNextDay,
    goToday,
    advanceToNextDay,
    isToday,
    canGoNext,
    label: dateLabel,
    short: shortDate,
    todayStr,
  } = useActiveDate();

  const [allMeals, setAllMeals] = useState<MealLog[]>([]);
  const [gymDay, setGymDay] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [newDayOpen, setNewDayOpen] = useState(false);

  useEffect(() => {
    dedupeMeals();
    setAllMeals(getAllMeals());
  }, []);

  useEffect(() => {
    if (!activeDate) return;
    setGymDay(getDaily(activeDate).gymDay);
  }, [activeDate]);

  function handleClearActive() {
    if (typeof window === "undefined" || !activeDate) return;
    const confirmed = window.confirm(
      `Clear all meals logged on ${shortDate}? This cannot be undone.`
    );
    if (!confirmed) return;
    clearMealsForDate(activeDate);
    setAllMeals(getAllMeals());
  }

  function handleConfirmNewDay() {
    advanceToNextDay();
    setNewDayOpen(false);
  }

  const dayMeals = useMemo(
    () => allMeals.filter((m) => m.date === activeDate),
    [allMeals, activeDate]
  );

  const byType = useMemo(() => {
    const m: Record<MealType, MealBucket> = {
      breakfast: { macros: { ...EMPTY_MACROS }, items: 0 },
      lunch:     { macros: { ...EMPTY_MACROS }, items: 0 },
      snack:     { macros: { ...EMPTY_MACROS }, items: 0 },
      dinner:    { macros: { ...EMPTY_MACROS }, items: 0 },
    };
    for (const meal of dayMeals) {
      m[meal.mealType].macros = addMacros(m[meal.mealType].macros, sumMealMacros(meal));
      m[meal.mealType].items += meal.items.length;
    }
    return m;
  }, [dayMeals]);

  const totals = useMemo<Macros>(() => {
    return (Object.values(byType) as MealBucket[]).reduce(
      (a, b) => addMacros(a, b.macros),
      EMPTY_MACROS
    );
  }, [byType]);

  const target = gymDay ? TARGETS.gymDay : TARGETS.restDay;
  const wk = activeDate ? weekNumber(parseDate(activeDate)) : 1;

  // Active-meal highlight: only relevant for today; uses device local hours.
  const currentHour = isToday ? new Date().getHours() : -1;
  const activeMeal: MealType | null =
    currentHour >= 6 && currentHour < 11 ? "breakfast" :
    currentHour >= 11 && currentHour < 14 ? "lunch" :
    currentHour >= 14 && currentHour < 17 ? "snack" :
    currentHour >= 17 && currentHour < 22 ? "dinner" : null;

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
            {!isToday && (
              <button type="button" className="mh-today-btn mono" onClick={goToday}>
                ← TODAY
              </button>
            )}
          </div>
          <div className="mh-date-nav">
            <button
              type="button"
              className="mh-date-arrow"
              onClick={goPrevDay}
              aria-label="Previous day"
            >
              ←
            </button>
            <button
              type="button"
              className="mh-date-btn mono"
              onClick={() => setPickerOpen(true)}
              aria-label="Pick date"
            >
              {dateLabel} ▾
            </button>
            <button
              type="button"
              className="mh-date-arrow"
              onClick={goNextDay}
              disabled={!canGoNext}
              aria-label="Next day"
            >
              →
            </button>
          </div>
          <div className="mh-subtitle mono">
            WK {wk} / 12 · {gymDay ? "GYM DAY" : "REST DAY"} · {target.kcal.toLocaleString()} kcal target
          </div>
        </div>

        <WeeklyGraph meals={allMeals} now={activeDate ? parseDate(activeDate) : null} />

        <div className="today-card">
          <div className="today-head">
            <div className="today-label">TODAY&apos;S PROGRESS</div>
            <div className="today-head-right">
              <div className="today-tag mono">{gymDay ? "GYM" : "REST"}</div>
              {dayMeals.length > 0 && (
                <button
                  type="button"
                  className="today-clear-btn mono"
                  onClick={handleClearActive}
                  aria-label="Clear meals for selected day"
                >
                  CLEAR
                </button>
              )}
              {isToday && (
                <button
                  type="button"
                  className="today-newday-btn mono"
                  onClick={() => setNewDayOpen(true)}
                  aria-label="Advance to next day"
                >
                  NEW DAY
                </button>
              )}
            </div>
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
                  href={`/meal/confirm?preset=${p.id}&date=${activeDate}`}
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
                <Link href={`/meal/${m.id}?date=${activeDate}`} className="meal-row-body">
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
                    <Link href={`/meal/${m.id}?date=${activeDate}`} className="mr-btn">VIEW</Link>
                    <Link href={`/meal/${m.id}?date=${activeDate}`} className="mr-btn primary">+ ADD</Link>
                  </div>
                )}
                {!logged && <span className="meal-chev">›</span>}
              </div>
            );
          })}
        </div>
      </div>

      {pickerOpen && activeDate && (
        <DatePicker
          activeDate={activeDate}
          todayStr={todayStr}
          onPick={(d) => {
            setActiveDate(d);
            setPickerOpen(false);
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {newDayOpen && (
        <div className="set-modal-overlay" onClick={() => setNewDayOpen(false)}>
          <div className="set-modal new-day-modal" onClick={(e) => e.stopPropagation()}>
            <div className="set-modal-body">
              <div className="set-modal-head">
                <div className="set-modal-ex">START NEW DAY?</div>
              </div>
              <div className="new-day-copy">
                Start tracking for tomorrow?
                <br />
                <strong>Today&apos;s data ({shortDate}) is saved.</strong>
                <br />
                The tracker will jump to tomorrow with a fresh page. You can always come
                back via the date picker.
              </div>
            </div>
            <div className="set-modal-actions">
              <button
                type="button"
                className="next-btn ghost"
                onClick={() => setNewDayOpen(false)}
              >
                CANCEL
              </button>
              <button type="button" className="next-btn" onClick={handleConfirmNewDay}>
                CONFIRM →
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
