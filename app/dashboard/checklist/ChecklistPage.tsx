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
import { TARGETS } from "@/lib/targets";
import { useActiveDate } from "@/lib/activeDate";
import { getTodaysWorkout } from "@/lib/workouts";

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

type Item = {
  key: string;
  label: string;
  auto: boolean;
};

const ITEMS: Item[] = [
  { key: "water",    label: "Water 3L+",     auto: false },
  { key: "creatine", label: "Creatine 10g",  auto: false },
  { key: "protein",  label: "Protein target hit", auto: true },
  { key: "gym",      label: "Gym session",   auto: true },
  { key: "whey",     label: "Whey shake",    auto: false },
  { key: "sleep",    label: "Sleep 7hr+",    auto: false },
];

export default function ChecklistPage() {
  const { activeDate } = useActiveDate();
  const [meals, setMeals] = useState<MealLog[]>([]);
  const [manual, setManual] = useState<Record<string, boolean>>({});
  const [gymDay, setGymDay] = useState(true);
  const [workoutDone, setWorkoutDone] = useState(false);

  useEffect(() => {
    dedupeMeals();
    document.body.classList.add("no-scroll");
    return () => document.body.classList.remove("no-scroll");
  }, []);

  useEffect(() => {
    if (!activeDate) return;
    setMeals(getMealsForDate(activeDate));
    const d = getDaily(activeDate);
    setManual(d.checklist ?? {});
    setGymDay(d.gymDay);
    setWorkoutDone(!!getTodaysWorkout(activeDate));
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

  const target = gymDay ? TARGETS.gymDay : TARGETS.restDay;
  const proteinHit = totals.protein >= target.protein;

  function isChecked(item: Item): boolean {
    if (item.key === "protein") return proteinHit;
    if (item.key === "gym") return workoutDone;
    return !!manual[item.key];
  }

  function toggle(item: Item) {
    if (item.auto || !activeDate) return;
    const next = { ...manual, [item.key]: !manual[item.key] };
    setManual(next);
    setDaily({ date: activeDate, gymDay, checklist: next });
  }

  const doneCount = ITEMS.filter(isChecked).length;
  const pct = Math.round((doneCount / ITEMS.length) * 100);

  return (
    <main className="sub-page">
      <header className="sub-head">
        <Link href="/dashboard" className="sub-back">← STATS</Link>
        <div className="sub-title">CHECKLIST</div>
        <div className="sub-sub mono">TODAY</div>
      </header>

      <div className="checklist-list">
        {ITEMS.map((item) => {
          const checked = isChecked(item);
          return (
            <button
              key={item.key}
              type="button"
              className={`cl-row${checked ? " checked" : ""}${item.auto ? " auto" : ""}`}
              onClick={() => toggle(item)}
            >
              <span className="cl-box">
                {checked ? (item.auto ? "●" : "✓") : "□"}
              </span>
              <span className="cl-label">{item.label}</span>
              {item.auto && <span className="cl-auto mono">AUTO</span>}
            </button>
          );
        })}
      </div>

      <div className="checklist-foot">
        <div className="cl-progress-label mono">
          {doneCount} / {ITEMS.length} COMPLETE
        </div>
        <div className="cl-progress-track">
          <div className="cl-progress-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </main>
  );
}
