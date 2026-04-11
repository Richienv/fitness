"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getIngredient, macrosFor, type Macros } from "@/lib/ingredients";
import {
  dedupeMeals,
  deleteMeal,
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
import { useActiveDate } from "@/lib/activeDate";

const EMPTY: Macros = { kcal: 0, protein: 0, carbs: 0, fat: 0 };

const MEAL_SLOTS: { id: MealType; emoji: string; name: string; window: string }[] = [
  { id: "breakfast", emoji: "🌅", name: "BREAKFAST", window: "6–10 AM" },
  { id: "lunch",     emoji: "☀️", name: "LUNCH",     window: "11 AM–2 PM" },
  { id: "snack",     emoji: "🍎", name: "SNACK",     window: "2–5 PM" },
  { id: "dinner",    emoji: "🌙", name: "DINNER",    window: "5–9 PM" },
];

const CHECKLIST: { key: string; label: string }[] = [
  { key: "water",    label: "💧 Water (2L+)" },
  { key: "protein",  label: "🍗 Protein target hit" },
  { key: "veg",      label: "🥦 Vegetables in 2+ meals" },
  { key: "creatine", label: "💊 Creatine taken" },
  { key: "sleep",    label: "😴 7+ hours sleep last night" },
];

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

function addMacros(a: Macros, b: Macros): Macros {
  return {
    kcal: a.kcal + b.kcal,
    protein: a.protein + b.protein,
    carbs: a.carbs + b.carbs,
    fat: a.fat + b.fat,
  };
}

function itemLabel(it: MealItem): string {
  if (isCustomItem(it)) return `${it.name} · ${it.grams}g`;
  const ing = getIngredient(it.id);
  if (!ing) return it.id;
  if (ing.gramsPerUnit) {
    const g = Math.round(it.qty * ing.gramsPerUnit);
    return `${ing.name} · ${it.qty} × (${g}g)`;
  }
  return `${ing.name} · ${it.qty} × ${ing.unit}`;
}

function OverflowBar({
  label,
  value,
  target,
  unit = "",
}: {
  label: string;
  value: number;
  target: number;
  unit?: string;
}) {
  const val = Math.round(value);
  const pct = Math.min(100, Math.round((val / target) * 100));
  const over = Math.max(0, val - target);
  const overPct = over > 0 ? Math.min(40, Math.round((over / target) * 100)) : 0;
  const isOver = over > 0;
  return (
    <div style={{ marginBottom: 14 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 11,
          color: "var(--muted)",
          marginBottom: 6,
          fontFamily: "var(--font-dm-mono)",
          textTransform: "uppercase",
          letterSpacing: 1,
        }}
      >
        <span>{label}</span>
        <span>
          <strong style={{ color: isOver ? "#ff5a5a" : "var(--text)" }}>
            {val.toLocaleString()}
            {unit}
          </strong>{" "}
          / {target.toLocaleString()}
          {unit}
        </span>
      </div>
      <div
        style={{
          display: "flex",
          height: 10,
          background: "var(--surface2)",
          borderRadius: 999,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            background: isOver ? "#ff9a3c" : "var(--accent)",
            transition: "width 0.3s ease",
          }}
        />
        {isOver && (
          <div
            style={{
              width: `${overPct}%`,
              background: "#ff5a5a",
              transition: "width 0.3s ease",
            }}
          />
        )}
      </div>
      {isOver && (
        <div
          style={{
            marginTop: 4,
            fontSize: 10,
            fontFamily: "var(--font-dm-mono)",
            color: "#ff5a5a",
            letterSpacing: 1,
          }}
        >
          ⚠️ +{over}
          {unit} OVER
        </div>
      )}
    </div>
  );
}

type MealCardProps = {
  meal: MealLog;
  activeDate: string;
  onChanged: () => void;
};

function MealCard({ meal, activeDate, onChanged }: MealCardProps) {
  const [open, setOpen] = useState(false);
  const macros = sumItems(meal.items);
  const slot = MEAL_SLOTS.find((s) => s.id === meal.mealType);
  const loggedTime = new Date(meal.loggedAt).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  function updateQty(idx: number, delta: number) {
    const it = meal.items[idx];
    if (isCustomItem(it)) return;
    const ing = getIngredient(it.id);
    const step = ing?.step ?? 1;
    const nextQty = Math.max(0, Math.round((it.qty + delta * step) * 10) / 10);
    if (nextQty === 0) {
      removeItem(idx);
      return;
    }
    const next = meal.items.map((x, i) => (i === idx ? { ...(x as { id: string; qty: number }), qty: nextQty } : x));
    updateMealItems(meal.id, next);
    onChanged();
  }

  function removeItem(idx: number) {
    const next = meal.items.filter((_, i) => i !== idx);
    updateMealItems(meal.id, next);
    onChanged();
  }

  function handleRecalc() {
    dedupeMeals();
    onChanged();
  }

  function handleDelete() {
    if (typeof window === "undefined") return;
    if (!window.confirm(`Delete entire ${meal.mealType} log?`)) return;
    deleteMeal(meal.id);
    onChanged();
  }

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "12px 14px",
          background: "transparent",
          border: "none",
          color: "var(--text)",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <span style={{ fontSize: 20 }}>{slot?.emoji}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 11,
              fontFamily: "var(--font-dm-mono)",
              letterSpacing: 1,
              color: "var(--accent)",
            }}
          >
            {slot?.name ?? meal.mealType.toUpperCase()} · {loggedTime}
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
            {meal.items.length} items · {Math.round(macros.kcal).toLocaleString()} kcal ·{" "}
            {Math.round(macros.protein)}g P
          </div>
        </div>
        <span style={{ fontSize: 14, color: "var(--muted)" }}>{open ? "▾" : "›"}</span>
      </button>

      {open && (
        <div style={{ borderTop: "1px solid var(--border)", padding: "10px 14px 14px" }}>
          <div style={{ display: "grid", gap: 6 }}>
            {meal.items.map((it, idx) => {
              const m = itemMacros(it);
              return (
                <div
                  key={idx}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 10px",
                    background: "var(--surface2)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: "var(--text)" }}>{itemLabel(it)}</div>
                    <div
                      style={{
                        fontSize: 10,
                        color: "var(--muted)",
                        fontFamily: "var(--font-dm-mono)",
                        marginTop: 2,
                      }}
                    >
                      {Math.round(m.kcal)} kcal · {Math.round(m.protein)}P/{Math.round(m.carbs)}C/
                      {Math.round(m.fat)}F
                    </div>
                  </div>
                  {!isCustomItem(it) && (
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <button
                        type="button"
                        onClick={() => updateQty(idx, -1)}
                        style={qtyBtnStyle}
                        aria-label="Decrease"
                      >
                        −
                      </button>
                      <span
                        style={{
                          minWidth: 24,
                          textAlign: "center",
                          fontFamily: "var(--font-dm-mono)",
                          fontSize: 11,
                        }}
                      >
                        {it.qty}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateQty(idx, +1)}
                        style={qtyBtnStyle}
                        aria-label="Increase"
                      >
                        +
                      </button>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => removeItem(idx)}
                    style={{ ...qtyBtnStyle, color: "#ff7a7a" }}
                    aria-label="Remove"
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>

          <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
            <Link href={`/meal/${meal.mealType}?date=${activeDate}`} style={actionBtnStyle}>
              + ADD
            </Link>
            <Link
              href={`/meal/${meal.mealType}?date=${activeDate}`}
              style={{ ...actionBtnStyle, background: "var(--surface2)" }}
            >
              EDIT
            </Link>
            <button type="button" onClick={handleRecalc} style={{ ...actionBtnStyle, background: "var(--surface2)" }}>
              RECALC
            </button>
            <button
              type="button"
              onClick={handleDelete}
              style={{ ...actionBtnStyle, background: "transparent", color: "#ff7a7a", borderColor: "#ff7a7a" }}
            >
              DELETE
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const qtyBtnStyle: React.CSSProperties = {
  width: 26,
  height: 26,
  borderRadius: 6,
  border: "1px solid var(--border)",
  background: "var(--surface)",
  color: "var(--text)",
  fontSize: 14,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const actionBtnStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid var(--accent)",
  background: "var(--accent)",
  color: "var(--bg)",
  fontSize: 10,
  fontFamily: "var(--font-dm-mono)",
  letterSpacing: 1,
  textDecoration: "none",
  cursor: "pointer",
  fontWeight: 600,
};

function buildSuggestion(totals: Macros, target: Macros, mealsCount: number): string {
  const kcalLeft = target.kcal - totals.kcal;
  const pLeft = target.protein - totals.protein;
  if (mealsCount === 0) return "💡 No meals yet — start with breakfast to hit your targets.";
  if (totals.kcal > target.kcal + 100) return "⚠️ Over calorie target — consider a lighter next meal.";
  if (pLeft > 40 && kcalLeft < 500) return "💡 Protein is behind — add a whey scoop or chicken to close the gap.";
  if (kcalLeft > 800) return "💡 Lots of room left — don't skip your next meal.";
  if (pLeft <= 0 && kcalLeft <= 200) return "✅ Targets almost locked — finish strong.";
  return "💡 On track — keep it steady.";
}

export default function Dashboard() {
  const { activeDate, label: dateLabel, goPrevDay, goNextDay, canGoNext } = useActiveDate();
  const [meals, setMeals] = useState<MealLog[]>([]);
  const [gymDay, setGymDayState] = useState(true);
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [version, setVersion] = useState(0);

  useEffect(() => {
    dedupeMeals();
  }, []);

  useEffect(() => {
    if (!activeDate) return;
    setMeals(getMealsForDate(activeDate));
    const d = getDaily(activeDate);
    setGymDayState(d.gymDay);
    setChecklist(d.checklist ?? {});
  }, [activeDate, version]);

  function refresh() {
    setVersion((v) => v + 1);
  }

  function toggleGym(val: boolean) {
    if (!activeDate) return;
    setGymDayState(val);
    setDaily({ date: activeDate, gymDay: val, checklist });
  }

  function toggleCheck(key: string) {
    if (!activeDate) return;
    const next = { ...checklist, [key]: !checklist[key] };
    setChecklist(next);
    setDaily({ date: activeDate, gymDay, checklist: next });
  }

  const byType = useMemo(() => {
    const m: Record<MealType, Macros> = {
      breakfast: { ...EMPTY },
      lunch: { ...EMPTY },
      snack: { ...EMPTY },
      dinner: { ...EMPTY },
    };
    for (const meal of meals) {
      m[meal.mealType] = addMacros(m[meal.mealType], sumItems(meal.items));
    }
    return m;
  }, [meals]);

  const totals: Macros = useMemo(
    () => meals.reduce<Macros>((a, m) => addMacros(a, sumItems(m.items)), { ...EMPTY }),
    [meals]
  );

  const target = gymDay ? TARGETS.gymDay : TARGETS.restDay;
  const targetMacros: Macros = {
    kcal: target.kcal,
    protein: target.protein,
    carbs: target.carbs,
    fat: target.fat,
  };

  const remaining = {
    kcal: Math.max(0, target.kcal - totals.kcal),
    protein: Math.max(0, target.protein - totals.protein),
    carbs: Math.max(0, target.carbs - totals.carbs),
    fat: Math.max(0, target.fat - totals.fat),
  };

  const suggestion = buildSuggestion(totals, targetMacros, meals.length);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, paddingBottom: 80 }}>
      <div className="mh-date-nav">
        <button
          type="button"
          className="mh-date-arrow"
          onClick={goPrevDay}
          aria-label="Previous day"
        >
          ←
        </button>
        <div className="mh-date-btn mono" aria-label="Viewing date">
          {dateLabel}
        </div>
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

      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={() => toggleGym(true)}
          style={{
            flex: 1,
            padding: "10px 14px",
            borderRadius: 999,
            border: `1px solid ${gymDay ? "var(--accent)" : "var(--border)"}`,
            background: gymDay ? "var(--surface2)" : "var(--surface)",
            color: gymDay ? "var(--accent)" : "var(--muted)",
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          GYM DAY
        </button>
        <button
          onClick={() => toggleGym(false)}
          style={{
            flex: 1,
            padding: "10px 14px",
            borderRadius: 999,
            border: `1px solid ${!gymDay ? "var(--accent)" : "var(--border)"}`,
            background: !gymDay ? "var(--surface2)" : "var(--surface)",
            color: !gymDay ? "var(--accent)" : "var(--muted)",
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          REST DAY
        </button>
      </div>

      <div
        style={{
          padding: 16,
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
        }}
      >
        <OverflowBar label="Calories" value={totals.kcal} target={target.kcal} />
        <OverflowBar label="Protein" value={totals.protein} target={target.protein} unit="g" />
        <OverflowBar label="Carbs" value={totals.carbs} target={target.carbs} unit="g" />
        <OverflowBar label="Fat" value={totals.fat} target={target.fat} unit="g" />
      </div>

      <div
        style={{
          padding: "12px 14px",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          fontSize: 12,
          color: "var(--text)",
          lineHeight: 1.5,
        }}
      >
        {suggestion}
      </div>

      <div
        style={{
          padding: 14,
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontFamily: "var(--font-dm-mono)",
            letterSpacing: 1,
            color: "var(--muted)",
            marginBottom: 10,
          }}
        >
          REMAINING TODAY
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
          {[
            { label: "KCAL", val: remaining.kcal },
            { label: "P", val: remaining.protein, unit: "g" },
            { label: "C", val: remaining.carbs, unit: "g" },
            { label: "F", val: remaining.fat, unit: "g" },
          ].map((x) => (
            <div
              key={x.label}
              style={{
                textAlign: "center",
                padding: "8px 4px",
                background: "var(--surface2)",
                borderRadius: 8,
              }}
            >
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: x.val === 0 ? "var(--muted)" : "var(--text)",
                }}
              >
                {Math.round(x.val)}
                {x.unit ?? ""}
              </div>
              <div
                style={{
                  fontSize: 9,
                  color: "var(--muted)",
                  fontFamily: "var(--font-dm-mono)",
                  letterSpacing: 1,
                  marginTop: 2,
                }}
              >
                {x.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div
          className="group-label"
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
        >
          <span>MEALS ({meals.length})</span>
          <button
            type="button"
            onClick={() => {
              dedupeMeals();
              refresh();
            }}
            style={{
              padding: "4px 10px",
              fontSize: 9,
              fontFamily: "var(--font-dm-mono)",
              letterSpacing: 1,
              borderRadius: 6,
              border: "1px solid var(--border)",
              background: "var(--surface)",
              color: "var(--muted)",
              cursor: "pointer",
            }}
          >
            RECALC ALL
          </button>
        </div>
        {meals.length === 0 ? (
          <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 8 }}>No meals logged yet.</p>
        ) : (
          <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
            {meals.map((m) => (
              <MealCard key={m.id} meal={m} activeDate={activeDate ?? ""} onChanged={refresh} />
            ))}
          </div>
        )}
      </div>

      <div
        style={{
          padding: 14,
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontFamily: "var(--font-dm-mono)",
            letterSpacing: 1,
            color: "var(--muted)",
            marginBottom: 10,
          }}
        >
          MEAL TIMING
        </div>
        <div style={{ display: "grid", gap: 6 }}>
          {MEAL_SLOTS.map((s) => {
            const macros = byType[s.id];
            const has = macros.kcal > 0;
            return (
              <div
                key={s.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 10px",
                  background: "var(--surface2)",
                  borderRadius: 8,
                  fontSize: 12,
                  opacity: has ? 1 : 0.55,
                }}
              >
                <span style={{ fontSize: 16 }}>{s.emoji}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, color: "var(--text)" }}>{s.name}</div>
                  <div
                    style={{
                      fontSize: 9,
                      color: "var(--muted)",
                      fontFamily: "var(--font-dm-mono)",
                      letterSpacing: 1,
                    }}
                  >
                    {s.window}
                  </div>
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-dm-mono)",
                    fontSize: 11,
                    color: has ? "var(--accent)" : "var(--muted)",
                  }}
                >
                  {has ? `${Math.round(macros.kcal)} kcal` : "—"}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div
        style={{
          padding: 14,
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontFamily: "var(--font-dm-mono)",
            letterSpacing: 1,
            color: "var(--muted)",
            marginBottom: 10,
          }}
        >
          TODAY&apos;S CHECKLIST
        </div>
        <div style={{ display: "grid", gap: 6 }}>
          {CHECKLIST.map((c) => {
            const on = !!checklist[c.key];
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => toggleCheck(c.key)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 12px",
                  background: on ? "var(--surface2)" : "transparent",
                  border: `1px solid ${on ? "var(--accent)" : "var(--border)"}`,
                  borderRadius: 8,
                  color: on ? "var(--text)" : "var(--muted)",
                  fontSize: 12,
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <span
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 4,
                    border: `1px solid ${on ? "var(--accent)" : "var(--border)"}`,
                    background: on ? "var(--accent)" : "transparent",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--bg)",
                    fontSize: 11,
                    flexShrink: 0,
                  }}
                >
                  {on ? "✓" : ""}
                </span>
                <span style={{ flex: 1 }}>{c.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
