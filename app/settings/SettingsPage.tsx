"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  DEFAULT_SETTINGS,
  getSettings,
  resetSettings,
  setSettings,
  type MacroTarget,
  type UserSettings,
} from "@/lib/settings";
import { clearMealsForDate, getAllMeals, getCustomFoods, deleteCustomFood } from "@/lib/store";
import {
  deleteCustomTemplate,
  getAllWorkouts,
  getCustomTemplates,
} from "@/lib/workouts";
import { todayKey } from "@/lib/targets";

type MacroKey = keyof MacroTarget;

const MACRO_FIELDS: { key: MacroKey; label: string; unit: string; step: number }[] = [
  { key: "kcal",    label: "Calories", unit: "kcal", step: 50 },
  { key: "protein", label: "Protein",  unit: "g",    step: 5  },
  { key: "carbs",   label: "Carbs",    unit: "g",    step: 5  },
  { key: "fat",     label: "Fat",      unit: "g",    step: 5  },
];

export default function SettingsPage() {
  const [settings, setLocalSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [customFoodCount, setCustomFoodCount] = useState(0);
  const [customTemplateCount, setCustomTemplateCount] = useState(0);
  const [mealCount, setMealCount] = useState(0);
  const [workoutCount, setWorkoutCount] = useState(0);
  const [confirming, setConfirming] = useState<null | "today" | "custom-foods" | "custom-templates" | "reset">(null);
  const [savedChip, setSavedChip] = useState(false);

  useEffect(() => {
    refresh();
  }, []);

  function refresh() {
    setLocalSettings(getSettings());
    setCustomFoodCount(getCustomFoods().length);
    setCustomTemplateCount(getCustomTemplates().length);
    setMealCount(getAllMeals().length);
    setWorkoutCount(getAllWorkouts().length);
  }

  function bump() {
    setSavedChip(true);
    setTimeout(() => setSavedChip(false), 1200);
  }

  function updateTarget(day: "gymDay" | "restDay", field: MacroKey, delta: number) {
    const cur = { ...settings };
    const val = Math.max(0, cur.targets[day][field] + delta);
    cur.targets = {
      ...cur.targets,
      [day]: { ...cur.targets[day], [field]: val },
    };
    setLocalSettings(cur);
    setSettings(cur);
    bump();
  }

  function updateStartDate(v: string) {
    const cur = { ...settings, startDate: v };
    setLocalSettings(cur);
    setSettings(cur);
    bump();
  }

  function resetToDefaults() {
    resetSettings();
    refresh();
    bump();
  }

  function clearTodayAll() {
    const today = todayKey();
    // Clear today's meals
    clearMealsForDate(today);
    // Mark today's workouts as deleted by filtering them out via saveWorkout reassignment.
    // workouts.ts doesn't expose a date-targeted clear, so we rewrite each one as skipped
    // by setting completed=false + endedAt=undefined isn't right — easier: filter out of storage.
    const remaining = getAllWorkouts().filter((w) => w.date !== today);
    window.localStorage.setItem("richie.workouts.v1", JSON.stringify(remaining));
    // Clear active workout pointer if it pointed to today
    window.localStorage.removeItem("richie.activeWorkout.v1");
    // Clear today's daily flags (meals key handled above)
    const dailyRaw = window.localStorage.getItem("richie.daily.v1");
    if (dailyRaw) {
      try {
        const map = JSON.parse(dailyRaw) as Record<string, unknown>;
        delete map[today];
        window.localStorage.setItem("richie.daily.v1", JSON.stringify(map));
      } catch {}
    }
    refresh();
    setConfirming(null);
    bump();
  }

  function clearAllCustomFoods() {
    for (const f of getCustomFoods()) deleteCustomFood(f.id);
    refresh();
    setConfirming(null);
    bump();
  }

  function clearAllCustomTemplates() {
    for (const t of getCustomTemplates()) deleteCustomTemplate(t.id);
    refresh();
    setConfirming(null);
    bump();
  }

  function exportAll() {
    if (typeof window === "undefined") return;
    const dump: Record<string, unknown> = {};
    for (const key of [
      "richie.meals.v1",
      "richie.daily.v1",
      "richie.customfoods.v1",
      "richie.ingredientoverrides.v1",
      "richie.workouts.v1",
      "richie.customTemplates.v1",
      "richie.activeWorkout.v1",
      "richie.settings.v1",
    ]) {
      const raw = window.localStorage.getItem(key);
      if (raw) {
        try {
          dump[key] = JSON.parse(raw);
        } catch {
          dump[key] = raw;
        }
      }
    }
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `r2fit-export-${todayKey()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const gymTotal = macroTotal(settings.targets.gymDay);
  const restTotal = macroTotal(settings.targets.restDay);

  return (
    <main className="sub-page settings-page">
      <header className="sub-head">
        <Link href="/" className="sub-back">← HOME</Link>
        <div className="sub-title">SETTINGS</div>
        <div className="sub-sub mono">CONFIG · DATA</div>
      </header>

      <div className="settings-scroll">
        {savedChip && <div className="settings-saved mono">✓ SAVED</div>}

        <section className="settings-section">
          <div className="settings-section-label mono">// DAILY TARGETS</div>

          <TargetBlock
            title="GYM DAY"
            emoji="🏋️"
            target={settings.targets.gymDay}
            total={gymTotal}
            onStep={(k, d) => updateTarget("gymDay", k, d)}
          />
          <TargetBlock
            title="REST DAY"
            emoji="🌙"
            target={settings.targets.restDay}
            total={restTotal}
            onStep={(k, d) => updateTarget("restDay", k, d)}
          />
        </section>

        <section className="settings-section">
          <div className="settings-section-label mono">// PROGRAM</div>
          <div className="settings-row">
            <div className="settings-row-label">Week 1 start</div>
            <input
              type="date"
              value={settings.startDate}
              onChange={(e) => updateStartDate(e.target.value)}
              className="settings-input"
            />
          </div>
          <div className="settings-row-hint mono">
            Controls the week counter (1–12) shown across the app.
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section-label mono">// LIBRARIES</div>

          <LibraryRow
            label="Custom foods"
            count={customFoodCount}
            manageHref="/meal"
            manageLabel="MANAGE"
            onClear={customFoodCount > 0 ? () => setConfirming("custom-foods") : undefined}
            confirming={confirming === "custom-foods"}
            onConfirm={clearAllCustomFoods}
            onCancel={() => setConfirming(null)}
          />
          <LibraryRow
            label="Custom workout templates"
            count={customTemplateCount}
            manageHref="/workout"
            manageLabel="MANAGE"
            onClear={customTemplateCount > 0 ? () => setConfirming("custom-templates") : undefined}
            confirming={confirming === "custom-templates"}
            onConfirm={clearAllCustomTemplates}
            onCancel={() => setConfirming(null)}
          />
        </section>

        <section className="settings-section">
          <div className="settings-section-label mono">// DATA</div>

          <div className="settings-stat-grid">
            <div className="settings-stat">
              <div className="settings-stat-num">{mealCount}</div>
              <div className="settings-stat-sub mono">MEALS LOGGED</div>
            </div>
            <div className="settings-stat">
              <div className="settings-stat-num">{workoutCount}</div>
              <div className="settings-stat-sub mono">WORKOUTS LOGGED</div>
            </div>
          </div>

          <button type="button" className="settings-action" onClick={exportAll}>
            ⬇ EXPORT ALL DATA (JSON)
          </button>

          {confirming === "today" ? (
            <div className="settings-confirm">
              <div className="settings-confirm-text mono">
                Wipe today&apos;s meals, workouts, and daily flags? This cannot be undone.
              </div>
              <div className="settings-confirm-actions">
                <button className="settings-ghost" onClick={() => setConfirming(null)}>Cancel</button>
                <button className="settings-danger" onClick={clearTodayAll}>WIPE TODAY</button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="settings-action danger"
              onClick={() => setConfirming("today")}
            >
              ⚠ RESET TODAY
            </button>
          )}

          {confirming === "reset" ? (
            <div className="settings-confirm">
              <div className="settings-confirm-text mono">
                Restore default targets + start date? Your logged meals / workouts stay.
              </div>
              <div className="settings-confirm-actions">
                <button className="settings-ghost" onClick={() => setConfirming(null)}>Cancel</button>
                <button className="settings-danger" onClick={resetToDefaults}>RESTORE DEFAULTS</button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="settings-action"
              onClick={() => setConfirming("reset")}
            >
              ↺ RESTORE DEFAULT TARGETS
            </button>
          )}
        </section>

        <div className="settings-foot mono">
          All settings stored locally. Export before switching devices.
        </div>

        <div className="today-bottom-spacer" />
      </div>
    </main>
  );
}

function macroTotal(t: MacroTarget): string {
  return `${t.kcal.toLocaleString()} kcal · ${t.protein}p · ${t.carbs}c · ${t.fat}f`;
}

function TargetBlock({
  title,
  emoji,
  target,
  total,
  onStep,
}: {
  title: string;
  emoji: string;
  target: MacroTarget;
  total: string;
  onStep: (key: MacroKey, delta: number) => void;
}) {
  return (
    <div className="settings-target">
      <div className="settings-target-head">
        <div className="settings-target-title">
          <span>{emoji}</span>
          <span>{title}</span>
        </div>
        <div className="settings-target-total mono">{total}</div>
      </div>
      <div className="settings-macro-grid">
        {MACRO_FIELDS.map((f) => (
          <div key={f.key} className="settings-macro">
            <div className="settings-macro-label mono">{f.label}</div>
            <div className="settings-macro-row">
              <button
                type="button"
                className="settings-step"
                onClick={() => onStep(f.key, -f.step)}
              >
                −
              </button>
              <div className="settings-macro-val">
                <span className="settings-macro-num">{target[f.key]}</span>
                <span className="settings-macro-unit mono">{f.unit}</span>
              </div>
              <button
                type="button"
                className="settings-step"
                onClick={() => onStep(f.key, f.step)}
              >
                +
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LibraryRow({
  label,
  count,
  manageHref,
  manageLabel,
  onClear,
  confirming,
  onConfirm,
  onCancel,
}: {
  label: string;
  count: number;
  manageHref: string;
  manageLabel: string;
  onClear?: () => void;
  confirming: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (confirming) {
    return (
      <div className="settings-confirm">
        <div className="settings-confirm-text mono">
          Delete all {count} {label.toLowerCase()}? Cannot be undone.
        </div>
        <div className="settings-confirm-actions">
          <button className="settings-ghost" onClick={onCancel}>Cancel</button>
          <button className="settings-danger" onClick={onConfirm}>DELETE ALL</button>
        </div>
      </div>
    );
  }
  return (
    <div className="settings-row">
      <div className="settings-row-label">
        {label}
        <span className="settings-row-count mono">{count}</span>
      </div>
      <div className="settings-row-actions">
        <Link href={manageHref} className="settings-chip mono">{manageLabel}</Link>
        {onClear && (
          <button type="button" className="settings-chip danger mono" onClick={onClear}>
            CLEAR
          </button>
        )}
      </div>
    </div>
  );
}
