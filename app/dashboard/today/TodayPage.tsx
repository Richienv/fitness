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
import { useActiveDate, parseDate } from "@/lib/activeDate";
import { renderNutritionCard, shareBlob } from "@/lib/shareCards";
import { weekNumber } from "@/lib/workouts";

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

function smartTip(totals: Macros, target: Macros, mealsCount: number): string {
  const kcalLeft = target.kcal - totals.kcal;
  const pLeft = target.protein - totals.protein;
  if (mealsCount === 0) return "Log your first meal to get a recommendation.";
  if (totals.kcal > target.kcal + 100) return "Over calorie target — go lighter next meal.";
  if (pLeft > 40 && kcalLeft < 400) return "Protein low — prioritize a high-protein meal.";
  if (pLeft > 20) return `${Math.round(pLeft)}g protein left — you can hit target.`;
  if (kcalLeft < 200 && pLeft <= 10) return "Dialed in. Stay consistent.";
  return `${Math.round(kcalLeft)} kcal left for the day.`;
}

export default function TodayPage() {
  const { activeDate, short: shortDate } = useActiveDate();
  const [meals, setMeals] = useState<MealLog[]>([]);
  const [gymDay, setGymDayState] = useState(true);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    dedupeMeals();
    document.body.classList.add("no-scroll");
    return () => document.body.classList.remove("no-scroll");
  }, []);

  useEffect(() => {
    if (!activeDate) return;
    setMeals(getMealsForDate(activeDate));
    const d = getDaily(activeDate);
    setGymDayState(d.gymDay);
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

  function toggleGym(v: boolean) {
    if (!activeDate) return;
    setGymDayState(v);
    const cur = getDaily(activeDate);
    setDaily({ date: activeDate, gymDay: v, checklist: cur.checklist ?? {} });
  }

  const target = gymDay ? TARGETS.gymDay : TARGETS.restDay;
  const bars: { key: keyof Macros; label: string; unit: string }[] = [
    { key: "kcal", label: "CALORIES", unit: "" },
    { key: "protein", label: "PROTEIN", unit: "g" },
    { key: "carbs", label: "CARBS", unit: "g" },
    { key: "fat", label: "FAT", unit: "g" },
  ];

  const tip = smartTip(totals, { ...target }, meals.length);

  async function handleShare() {
    if (!activeDate) return;
    setSharing(true);
    try {
      const dateLine =
        parseDate(activeDate)
          .toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric" })
          .toUpperCase() + " · HANGZHOU";
      const blob = await renderNutritionCard({
        kcal: totals.kcal,
        protein: totals.protein,
        carbs: totals.carbs,
        fat: totals.fat,
        proteinTarget: target.protein,
        kcalTarget: target.kcal,
        mealsLogged: meals.length,
        week: weekNumber(parseDate(activeDate)),
        dateLine,
        gymDay,
      });
      await shareBlob(blob, `r2fit-day-${activeDate}.png`, "Day locked in.");
    } finally {
      setSharing(false);
    }
  }

  return (
    <main className="sub-page">
      <header className="sub-head">
        <Link href="/dashboard" className="sub-back">← STATS</Link>
        <div className="sub-title">TODAY</div>
        <div className="sub-sub mono">{shortDate}</div>
      </header>

      <div className="sub-toggle">
        <button
          type="button"
          className={`sub-toggle-btn${gymDay ? " on" : ""}`}
          onClick={() => toggleGym(true)}
        >
          GYM DAY
        </button>
        <button
          type="button"
          className={`sub-toggle-btn${!gymDay ? " on" : ""}`}
          onClick={() => toggleGym(false)}
        >
          REST DAY
        </button>
      </div>

      <div className="slim-bars" style={{ gap: 12 }}>
        {bars.map((b) => {
          const val = Math.round(totals[b.key]);
          const tgt = target[b.key];
          const pct = Math.min(100, Math.round((val / tgt) * 100));
          const left = Math.max(0, Math.round(tgt - val));
          return (
            <div key={b.key} className="slim-row">
              <div className="slim-head mono">
                <span className="slim-label">{b.label}</span>
                <span className="slim-nums">
                  <strong>{val.toLocaleString()}</strong> / {tgt.toLocaleString()}{b.unit}
                </span>
              </div>
              <div className="slim-track">
                <div className="slim-fill" style={{ width: `${pct}%` }} />
              </div>
              <div className="slim-foot mono">
                <span>{pct}%</span>
                <span>{left}{b.unit} left</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="remaining-grid">
        {bars.map((b) => {
          const left = Math.max(0, Math.round(target[b.key] - totals[b.key]));
          return (
            <div key={b.key} className="remaining-box">
              <div className="rb-num">{left.toLocaleString()}{b.unit}</div>
              <div className="rb-label mono">{b.label} LEFT</div>
            </div>
          );
        })}
      </div>

      <div className="smart-tip mono">💡 {tip}</div>

      <button type="button" className="share-btn" onClick={handleShare} disabled={sharing}>
        {sharing ? "GENERATING…" : "📤 SHARE TODAY"}
      </button>
    </main>
  );
}
