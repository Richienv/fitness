"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { getIngredient, macrosFor } from "@/lib/ingredients";
import { PRESETS } from "@/lib/presets";
import { saveMeal } from "@/lib/store";
import { useActiveDate } from "@/lib/activeDate";

export default function ConfirmMeal({
  presetId,
  dateParam,
}: {
  presetId: string;
  dateParam?: string;
}) {
  const router = useRouter();
  const { activeDate, setActiveDate, short } = useActiveDate();
  const preset = useMemo(() => PRESETS.find((p) => p.id === presetId), [presetId]);

  // Sync context with ?date= query param (URL is the source of truth for linked flows)
  useEffect(() => {
    if (dateParam && dateParam !== activeDate) setActiveDate(dateParam);
  }, [dateParam, activeDate, setActiveDate]);

  if (!preset) {
    return (
      <main className="shell">
        <Link href="/meal" className="back-link">← Back</Link>
        <h1 className="section-title">PRESET NOT FOUND</h1>
        <p style={{ color: "var(--muted)" }}>That preset doesn&apos;t exist.</p>
      </main>
    );
  }

  const totals = preset.items.reduce(
    (acc, it) => {
      const m = macrosFor(it.id, it.qty);
      return {
        kcal: acc.kcal + m.kcal,
        protein: acc.protein + m.protein,
        carbs: acc.carbs + m.carbs,
        fat: acc.fat + m.fat,
      };
    },
    { kcal: 0, protein: 0, carbs: 0, fat: 0 }
  );

  const saveDate = dateParam ?? activeDate;

  function save() {
    saveMeal({
      date: saveDate,
      mealType: preset!.mealType,
      items: preset!.items,
    });
    router.push("/meal");
  }

  function edit() {
    const params = new URLSearchParams({ preset: preset!.id, date: saveDate });
    router.push(`/meal/${preset!.mealType}?${params.toString()}`);
  }

  return (
    <main className="confirm-shell">
      <div className="confirm-top">
        <Link href="/meal" className="back-link">← Back</Link>
        <h1 className="confirm-title">{preset.label}</h1>
        <div className="confirm-sub mono">
          {preset.mealType.toUpperCase()} · {short}
        </div>

        <div className="confirm-items">
          {preset.items.map((it, i) => {
            const ing = getIngredient(it.id);
            if (!ing) return null;
            const m = macrosFor(it.id, it.qty);
            return (
              <div key={`${it.id}-${i}`} className="confirm-item">
                <div className="ci-qty">×{it.qty}</div>
                <div className="ci-main">
                  <div className="ci-name">{ing.name}</div>
                  <div className="ci-sub">{ing.unit}</div>
                </div>
                <div className="ci-kcal mono">{Math.round(m.kcal)} kcal</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="confirm-bottom">
        <div className="confirm-totals">
          <div className="confirm-kcal">
            <strong>{Math.round(totals.kcal)}</strong>
            <span>kcal</span>
          </div>
          <div className="confirm-macros mono">
            {Math.round(totals.protein)}p · {Math.round(totals.carbs)}c · {Math.round(totals.fat)}f
          </div>
        </div>
        <div className="confirm-actions">
          <button type="button" className="next-btn ghost" onClick={edit}>EDIT</button>
          <button type="button" className="next-btn" onClick={save}>SAVE ✓</button>
        </div>
      </div>
    </main>
  );
}
