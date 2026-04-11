"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getIngredient, macrosFor, type Macros } from "@/lib/ingredients";
import {
  dedupeMeals,
  getDaily,
  getMealsForDate,
  isCustomItem,
  setDaily,
  updateMealItems,
  type MealItem,
  type MealLog,
} from "@/lib/store";
import type { MealType } from "@/lib/presets";
import { TARGETS } from "@/lib/targets";
import { useActiveDate, parseDate } from "@/lib/activeDate";
import { renderNutritionCard, shareBlob } from "@/lib/shareCards";
import { weekNumber } from "@/lib/workouts";

const EMPTY: Macros = { kcal: 0, protein: 0, carbs: 0, fat: 0 };

const MEAL_ORDER: { type: MealType; emoji: string; label: string }[] = [
  { type: "breakfast", emoji: "🌅", label: "BREAKFAST" },
  { type: "lunch",     emoji: "☀️", label: "LUNCH" },
  { type: "snack",     emoji: "🍎", label: "SNACK" },
  { type: "dinner",    emoji: "🌙", label: "DINNER" },
];

function itemMacros(it: MealItem): Macros {
  if (isCustomItem(it)) {
    return { kcal: it.kcal, protein: it.protein, carbs: it.carbs, fat: it.fat };
  }
  return macrosFor(it.id, it.qty);
}

function sumItems(items: MealItem[]): Macros {
  return items.reduce<Macros>((a, it) => {
    const m = itemMacros(it);
    return {
      kcal: a.kcal + m.kcal,
      protein: a.protein + m.protein,
      carbs: a.carbs + m.carbs,
      fat: a.fat + m.fat,
    };
  }, { ...EMPTY });
}

function itemLabel(it: MealItem): string {
  if (isCustomItem(it)) return `${it.name} ${Math.round(it.grams)}g`;
  const ing = getIngredient(it.id);
  if (!ing) return `${it.qty}× item`;
  if (ing.gramsPerUnit) return `${ing.name} ${Math.round(ing.gramsPerUnit * it.qty)}g`;
  if (it.qty === 1) return ing.name;
  return `${it.qty}× ${ing.name}`;
}

function itemStep(it: MealItem): number {
  if (isCustomItem(it)) return 10;
  return getIngredient(it.id)?.step ?? 1;
}

function smartTip(totals: Macros, target: Macros, mealsCount: number): string {
  const kcalLeft = Math.round(target.kcal - totals.kcal);
  const pLeft = Math.round(target.protein - totals.protein);
  const cLeft = Math.round(target.carbs - totals.carbs);
  if (mealsCount === 0) return "Log your first meal to get a recommendation.";
  if (totals.kcal > target.kcal + 100) return "Over calorie target — go lighter next meal.";
  if (pLeft <= 0 && kcalLeft > 200) return "Protein done. Focus remaining calories on carbs.";
  if (totals.carbs < 40 && kcalLeft > 300) return `Only ${Math.round(totals.carbs)}g carbs. Eat a banana before dinner.`;
  if (kcalLeft > 700 && new Date().getHours() >= 17) return `${kcalLeft} kcal left. Don't skip dinner — muscles need fuel.`;
  if (kcalLeft < 300 && pLeft <= 10 && cLeft <= 30) return "Almost perfect day. Finish strong at dinner.";
  if (pLeft > 40 && kcalLeft < 400) return "Protein low — prioritize a high-protein meal.";
  if (pLeft > 20) return `${pLeft}g protein left — you can hit target.`;
  return `${kcalLeft} kcal left for the day.`;
}

export default function TodayPage() {
  const { activeDate, short: shortDate } = useActiveDate();
  const [meals, setMeals] = useState<MealLog[]>([]);
  const [gymDay, setGymDayState] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<{ mealId: string; index: number; qty: number } | null>(null);
  const [confirmDel, setConfirmDel] = useState<{ mealId: string; index: number } | null>(null);

  useEffect(() => {
    dedupeMeals();
  }, []);

  useEffect(() => {
    if (!activeDate) return;
    setMeals(getMealsForDate(activeDate));
    const d = getDaily(activeDate);
    setGymDayState(d.gymDay);
  }, [activeDate]);

  const totals = useMemo<Macros>(
    () =>
      meals.reduce<Macros>((a, m) => {
        const s = sumItems(m.items);
        return {
          kcal: a.kcal + s.kcal,
          protein: a.protein + s.protein,
          carbs: a.carbs + s.carbs,
          fat: a.fat + s.fat,
        };
      }, { ...EMPTY }),
    [meals]
  );

  function toggleGym(v: boolean) {
    if (!activeDate) return;
    setGymDayState(v);
    const cur = getDaily(activeDate);
    setDaily({ date: activeDate, gymDay: v, checklist: cur.checklist ?? {} });
  }

  function toggleExpand(mealId: string) {
    setExpanded((s) => ({ ...s, [mealId]: !s[mealId] }));
    setEditing(null);
    setConfirmDel(null);
  }

  function startEdit(meal: MealLog, index: number) {
    const it = meal.items[index];
    const qty = isCustomItem(it) ? it.grams : it.qty;
    setEditing({ mealId: meal.id, index, qty });
    setConfirmDel(null);
  }

  function adjustEdit(delta: number) {
    if (!editing) return;
    const meal = meals.find((m) => m.id === editing.mealId);
    if (!meal) return;
    const it = meal.items[editing.index];
    const stepSize = itemStep(it);
    const next = Math.round((editing.qty + delta * stepSize) * 100) / 100;
    if (next <= 0) return;
    setEditing({ ...editing, qty: next });
  }

  function saveEdit() {
    if (!editing) return;
    const meal = meals.find((m) => m.id === editing.mealId);
    if (!meal) return;
    const items = meal.items.map((it, i) => {
      if (i !== editing.index) return it;
      if (isCustomItem(it)) {
        const factor = editing.qty / it.grams;
        return {
          ...it,
          grams: editing.qty,
          kcal: it.kcal * factor,
          protein: it.protein * factor,
          carbs: it.carbs * factor,
          fat: it.fat * factor,
          sugar: it.sugar !== undefined ? it.sugar * factor : undefined,
          sodium: it.sodium !== undefined ? it.sodium * factor : undefined,
        };
      }
      return { ...it, qty: editing.qty };
    });
    updateMealItems(meal.id, items);
    setMeals(getMealsForDate(activeDate));
    setEditing(null);
  }

  function deleteItem(mealId: string, index: number) {
    const meal = meals.find((m) => m.id === mealId);
    if (!meal) return;
    const items = meal.items.filter((_, i) => i !== index);
    updateMealItems(mealId, items);
    setMeals(getMealsForDate(activeDate));
    setConfirmDel(null);
  }

  const target = gymDay ? TARGETS.gymDay : TARGETS.restDay;
  const bars: { key: keyof Macros; label: string; unit: string }[] = [
    { key: "kcal", label: "CALORIES", unit: "" },
    { key: "protein", label: "PROTEIN", unit: "g" },
    { key: "carbs", label: "CARBS", unit: "g" },
    { key: "fat", label: "FAT", unit: "g" },
  ];

  const tip = smartTip(totals, { ...target }, meals.length);

  const mealByType = useMemo(() => {
    const map = new Map<MealType, MealLog>();
    for (const m of meals) map.set(m.mealType, m);
    return map;
  }, [meals]);

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
    <main className="sub-page today-page">
      <header className="sub-head">
        <Link href="/dashboard" className="sub-back">← STATS</Link>
        <div className="sub-title">TODAY</div>
        <div className="sub-sub mono">{shortDate}</div>
      </header>

      <div className="today-scroll">
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

        <div className="today-divider" />
        <div className="today-meals-label mono">// TODAY&apos;S MEALS</div>

        <div className="today-meals">
          {MEAL_ORDER.map(({ type, emoji, label }) => {
            const meal = mealByType.get(type);
            const isExpanded = meal ? !!expanded[meal.id] : false;

            if (!meal) {
              return (
                <div key={type} className="meal-breakdown-card unlogged">
                  <div className="mbc-head">
                    <div className="mbc-title">
                      <span className="mbc-emoji">{emoji}</span>
                      <span className="mbc-label mono">{label}</span>
                    </div>
                    <div className="mbc-right">
                      <span className="mbc-unlogged mono">not logged</span>
                      <Link href={`/meal/${type}`} className="mbc-log-now mono">LOG NOW →</Link>
                    </div>
                  </div>
                </div>
              );
            }

            const mealTotals = sumItems(meal.items);
            return (
              <div key={type} className={`meal-breakdown-card${isExpanded ? " expanded" : ""}`}>
                <button
                  type="button"
                  className="mbc-head"
                  onClick={() => toggleExpand(meal.id)}
                >
                  <div className="mbc-title">
                    <span className="mbc-emoji">{emoji}</span>
                    <span className="mbc-label mono">{label}</span>
                  </div>
                  <div className="mbc-right">
                    <span className="mbc-kcal">{Math.round(mealTotals.kcal)} kcal</span>
                    <span className="mbc-chev">{isExpanded ? "▴" : "▾"}</span>
                  </div>
                </button>

                {isExpanded && (
                  <div className="mbc-body">
                    {meal.items.map((it, idx) => {
                      const m = itemMacros(it);
                      const isEditing = editing?.mealId === meal.id && editing.index === idx;
                      const isConfirming = confirmDel?.mealId === meal.id && confirmDel.index === idx;
                      const stepSize = itemStep(it);
                      const unitSuffix = isCustomItem(it) ? "g" : "";

                      if (isEditing) {
                        const live: MealItem = isCustomItem(it)
                          ? { ...it, grams: editing!.qty }
                          : { ...it, qty: editing!.qty };
                        const liveKcal = isCustomItem(it)
                          ? Math.round(it.kcal * (editing!.qty / it.grams))
                          : Math.round(itemMacros(live).kcal);
                        return (
                          <div key={idx} className="mbc-item editing">
                            <div className="mbc-item-name">{isCustomItem(it) ? it.name : getIngredient(it.id)?.name ?? "item"}</div>
                            <div className="mbc-edit-row">
                              <button type="button" className="mbc-step-btn" onClick={() => adjustEdit(-1)}>−</button>
                              <span className="mbc-edit-qty mono">
                                {editing!.qty}{unitSuffix}
                              </span>
                              <button type="button" className="mbc-step-btn" onClick={() => adjustEdit(1)}>+</button>
                              <span className="mbc-edit-kcal mono">{liveKcal} kcal</span>
                            </div>
                            <div className="mbc-edit-actions">
                              <button type="button" className="mbc-cancel" onClick={() => setEditing(null)}>CANCEL</button>
                              <button type="button" className="mbc-save" onClick={saveEdit}>SAVE ✓</button>
                            </div>
                            <span className="mbc-step-hint mono">±{stepSize}{unitSuffix || " unit"}</span>
                          </div>
                        );
                      }

                      if (isConfirming) {
                        return (
                          <div key={idx} className="mbc-item confirming">
                            <div className="mbc-confirm-text mono">Remove {isCustomItem(it) ? it.name : getIngredient(it.id)?.name}?</div>
                            <div className="mbc-edit-actions">
                              <button type="button" className="mbc-cancel" onClick={() => setConfirmDel(null)}>CANCEL</button>
                              <button type="button" className="mbc-remove" onClick={() => deleteItem(meal.id, idx)}>REMOVE</button>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div key={idx} className="mbc-item">
                          <div className="mbc-item-top">
                            <span className="mbc-item-name">{itemLabel(it)}</span>
                            <span className="mbc-item-kcal mono">{Math.round(m.kcal)} kcal</span>
                          </div>
                          <div className="mbc-item-actions">
                            <button type="button" className="mbc-icon-btn" onClick={() => startEdit(meal, idx)} aria-label="Edit">✏️</button>
                            <button type="button" className="mbc-icon-btn" onClick={() => setConfirmDel({ mealId: meal.id, index: idx })} aria-label="Delete">🗑️</button>
                          </div>
                        </div>
                      );
                    })}

                    <div className="mbc-footer-actions">
                      <Link href={`/meal/${type}`} className="mbc-add-more mono">+ ADD MORE</Link>
                      <Link href={`/meal/${type}`} className="mbc-edit-meal mono">EDIT MEAL</Link>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="today-bottom-spacer" />
      </div>
    </main>
  );
}
