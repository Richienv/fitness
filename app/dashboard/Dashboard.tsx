"use client";

import { useEffect, useState } from "react";
import { macrosFor, type Macros } from "@/lib/ingredients";
import { getMealsForDate, isCustomItem, type MealItem, type MealLog } from "@/lib/store";
import { TARGETS, todayKey } from "@/lib/targets";

function sumItems(items: MealItem[]): Macros {
  return items.reduce<Macros>(
    (acc, it) => {
      if (isCustomItem(it)) {
        return {
          kcal: acc.kcal + it.kcal,
          protein: acc.protein + it.protein,
          fat: acc.fat + it.fat,
          carbs: acc.carbs + it.carbs,
        };
      }
      const m = macrosFor(it.id, it.qty);
      return {
        kcal: acc.kcal + m.kcal,
        protein: acc.protein + m.protein,
        fat: acc.fat + m.fat,
        carbs: acc.carbs + m.carbs,
      };
    },
    { kcal: 0, protein: 0, fat: 0, carbs: 0 }
  );
}

type BarProps = { label: string; value: number; target: number; color: string; unit?: string };

function Bar({ label, value, target, color, unit = "" }: BarProps) {
  const pct = Math.min(100, Math.round((value / target) * 100));
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--muted)", marginBottom: 6, fontFamily: "var(--font-dm-mono)", textTransform: "uppercase", letterSpacing: 1 }}>
        <span>{label}</span>
        <span>
          <strong style={{ color: "var(--text)" }}>{Math.round(value)}{unit}</strong> / {target}{unit}
        </span>
      </div>
      <div style={{ height: 10, background: "var(--surface2)", borderRadius: 999, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, transition: "width 0.3s ease" }} />
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [meals, setMeals] = useState<MealLog[]>([]);
  const [gymDay, setGymDay] = useState(true);

  useEffect(() => {
    setMeals(getMealsForDate(todayKey()));
  }, []);

  const totals: Macros = sumItems(meals.flatMap((m) => m.items));
  const target = gymDay ? TARGETS.gymDay : TARGETS.restDay;

  return (
    <>
      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        <button
          onClick={() => setGymDay(true)}
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
          onClick={() => setGymDay(false)}
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

      <Bar label="Calories" value={totals.kcal} target={target.kcal} color="var(--accent)" />
      <Bar label="Protein"  value={totals.protein} target={target.protein} color="var(--green)" unit="g" />
      <Bar label="Carbs"    value={totals.carbs} target={target.carbs} color="var(--orange)" unit="g" />
      <Bar label="Fat"      value={totals.fat} target={target.fat} color="var(--blue)" unit="g" />

      <div className="group-label" style={{ marginTop: 32 }}>Today&apos;s meals ({meals.length})</div>
      {meals.length === 0 ? (
        <p style={{ color: "var(--muted)", fontSize: 13 }}>No meals logged yet.</p>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {meals.map((m) => (
            <div key={m.id} style={{ padding: 12, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 }}>
              <div style={{ textTransform: "uppercase", letterSpacing: 1, color: "var(--accent)", fontFamily: "var(--font-dm-mono)", fontSize: 10 }}>{m.mealType}</div>
              <div style={{ color: "var(--muted)", marginTop: 4 }}>{m.items.length} items · {Math.round(sumItems(m.items).kcal)} kcal</div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
