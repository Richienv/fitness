"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  HabitComboPayload,
  HabitFoodSnapshot,
  ShadowRecommendation,
} from "@/lib/habitGraph";
import type { MealType } from "@/lib/presets";
import { activityKcal, type ActivityKey, type Intensity } from "@/lib/burn";
import { readBodyKg } from "@/lib/burnData";
import { useSheetBack } from "@/lib/backSheet";
import Icon from "./Icon";

const SLOT_OPTIONS: { key: MealType; label: string }[] = [
  { key: "breakfast", label: "Sarapan" },
  { key: "lunch", label: "Siang" },
  { key: "snack", label: "Camilan" },
  { key: "dinner", label: "Malam" },
];

const SCALE_PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const WORKOUT_SET_SCALES = [
  { label: "Ringan (0.75×)", value: 0.75 },
  { label: "Standar (1×)", value: 1 },
  { label: "Ekstra (1.25×)", value: 1.25 },
];
const INTENSITIES: { key: Intensity; label: string }[] = [
  { key: "santai", label: "Santai" },
  { key: "sedang", label: "Sedang" },
  { key: "berat", label: "Berat" },
];

const round1 = (n: number) => Math.round(n * 10) / 10;

export type MealQuickEditResult = {
  slot: MealType;
  combo: HabitComboPayload;
};

export type WorkoutQuickEditResult = {
  setsScale?: number;
  durationMin?: number;
  steps?: number;
  reps?: number;
  intensity?: Intensity;
};

export default function ShadowQuickEditSheet({
  offer,
  submitLabel,
  onClose,
  onSaveMeal,
  onSaveWorkout,
  onStartLiveWorkout,
}: {
  offer: ShadowRecommendation;
  submitLabel?: string;
  onClose: () => void;
  onSaveMeal?: (offer: ShadowRecommendation, result: MealQuickEditResult) => void;
  onSaveWorkout?: (offer: ShadowRecommendation, result: WorkoutQuickEditResult) => void;
  onStartLiveWorkout?: (offer: ShadowRecommendation) => void;
}) {
  useSheetBack(true, onClose);

  // Meal edit state
  const [slot, setSlot] = useState<MealType>(offer.meal?.slot ?? "lunch");
  const [scale, setScale] = useState(1);
  const [itemScales, setItemScales] = useState<number[]>(() =>
    (offer.meal?.items ?? []).map(() => 1),
  );

  // Workout / activity edit state
  const [setsScale, setSetsScale] = useState(1);
  const [durationMin, setDurationMin] = useState<number>(
    offer.workout?.durationMin ?? offer.workout?.minutes ?? 30,
  );
  const [steps, setSteps] = useState<number>(offer.workout?.steps ?? 6000);
  const [reps, setReps] = useState<number>(offer.workout?.reps ?? 20);
  const [intensity, setIntensity] = useState<Intensity>(
    offer.workout?.intensity ?? "sedang",
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const editedMeal = useMemo<HabitComboPayload | null>(() => {
    if (!offer.meal) return null;
    const items: HabitFoodSnapshot[] = offer.meal.items.map((it, idx) => {
      const f = scale * (itemScales[idx] ?? 1);
      const grams = it.grams > 0 ? Math.round(it.grams * f) : 0;
      const qty = it.qty != null ? Math.max(0.25, round1(it.qty * f)) : undefined;
      const portionLabel =
        grams > 0
          ? `${grams} g`
          : qty != null && it.unit
            ? `${qty} × ${it.unit}`
            : it.portionLabel;
      return {
        ...it,
        grams,
        ...(qty != null ? { qty } : {}),
        ...(portionLabel ? { portionLabel } : {}),
        kcal: Math.round(it.kcal * f),
        protein: round1(it.protein * f),
        carbs: round1(it.carbs * f),
        fat: round1(it.fat * f),
        ...(it.sugar != null ? { sugar: round1(it.sugar * f) } : {}),
      };
    });
    return {
      slot,
      items,
      label:
        items.length <= 2
          ? items.map((i) => i.name).join(" + ")
          : `${items[0].name} + ${items[1].name} + ${items.length - 2} lainnya`,
      kcal: Math.round(items.reduce((s, i) => s + i.kcal, 0)),
      protein: round1(items.reduce((s, i) => s + i.protein, 0)),
      carbs: round1(items.reduce((s, i) => s + i.carbs, 0)),
      fat: round1(items.reduce((s, i) => s + i.fat, 0)),
      sugar: round1(items.reduce((s, i) => s + (i.sugar ?? 0), 0)),
    };
  }, [offer.meal, slot, scale, itemScales]);

  const estimatedWorkoutKcal = useMemo(() => {
    const w = offer.workout;
    if (!w) return 0;
    const kg = typeof window !== "undefined" ? readBodyKg() : 70;
    if (w.kind === "activity" && w.activityKind) {
      return Math.round(
        activityKcal(
          {
            kind: w.activityKind as ActivityKey,
            minutes: w.minutes != null ? durationMin : undefined,
            steps: w.steps != null ? steps : undefined,
            reps: w.reps != null ? reps : undefined,
            intensity,
          },
          kg,
        ),
      );
    }
    return Math.round((w.estimatedKcal || 180) * setsScale);
  }, [offer.workout, durationMin, steps, reps, intensity, setsScale]);

  return (
    <div className="shadow-edit-backdrop" onClick={onClose}>
      <div
        className="shadow-edit-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shadow-edit-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shadow-edit-head">
          <div>
            <h2 id="shadow-edit-title">Ubah cepat: {offer.title}</h2>
            <p>{offer.badge} · {offer.reason}</p>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Tutup ubah cepat"
            onClick={onClose}
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        {editedMeal && onSaveMeal && (
          <>
            <div>
              <span className="shadow-edit-section-label">Waktu makan</span>
              <div className="shadow-chip-row">
                {SLOT_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    className="shadow-chip-btn"
                    aria-pressed={slot === opt.key}
                    onClick={() => setSlot(opt.key)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="shadow-edit-section-label">Skala porsi</span>
              <div className="shadow-chip-row">
                {SCALE_PRESETS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className="shadow-chip-btn"
                    aria-pressed={scale === s}
                    onClick={() => setScale(s)}
                  >
                    {s}×
                  </button>
                ))}
              </div>
            </div>

            <div className="shadow-edit-items">
              {editedMeal.items.map((it, idx) => (
                <div className="shadow-edit-item" key={`${it.foodKey}:${idx}`}>
                  <div className="shadow-edit-item-name">
                    <strong>{it.name}</strong>
                    <small>
                      {it.portionLabel || `${it.grams} g`} · {Math.round(it.kcal)} kkal ·{" "}
                      {round1(it.protein)} g protein
                    </small>
                  </div>
                  <div className="shadow-stepper">
                    <button
                      type="button"
                      aria-label={`Kurangi porsi ${it.name}`}
                      onClick={() =>
                        setItemScales((prev) =>
                          prev.map((v, i) => (i === idx ? Math.max(0.25, round1(v - 0.25)) : v)),
                        )
                      }
                    >
                      <Icon name="minus" size={14} />
                    </button>
                    <span>{round1(scale * (itemScales[idx] ?? 1))}×</span>
                    <button
                      type="button"
                      aria-label={`Tambah porsi ${it.name}`}
                      onClick={() =>
                        setItemScales((prev) =>
                          prev.map((v, i) => (i === idx ? Math.min(4, round1(v + 0.25)) : v)),
                        )
                      }
                    >
                      <Icon name="plus" size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="shadow-edit-summary">
              <span>Total diperbarui</span>
              <strong>
                {editedMeal.kcal.toLocaleString("id-ID")} kkal · {editedMeal.protein} g P ·{" "}
                {editedMeal.carbs} g K · {editedMeal.fat} g L
              </strong>
            </div>

            <div className="shadow-edit-actions">
              <button
                type="button"
                className="primary-button"
                style={{ width: "100%", minHeight: 48 }}
                onClick={() => onSaveMeal(offer, { slot, combo: editedMeal })}
              >
                {submitLabel || "Catat sekarang ✓"}
              </button>
            </div>
          </>
        )}

        {offer.workout && onSaveWorkout && (
          <>
            {offer.workout.kind === "session" ? (
              <>
                <div>
                  <span className="shadow-edit-section-label">Jumlah set sesi</span>
                  <div className="shadow-chip-row">
                    {WORKOUT_SET_SCALES.map((s) => (
                      <button
                        key={s.value}
                        type="button"
                        className="shadow-chip-btn"
                        aria-pressed={setsScale === s.value}
                        onClick={() => setSetsScale(s.value)}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="shadow-edit-section-label" htmlFor="shadow-wo-dur">
                    Durasi sesi (menit)
                  </label>
                  <input
                    id="shadow-wo-dur"
                    type="number"
                    min={5}
                    max={240}
                    inputMode="numeric"
                    className="shadow-edit-input"
                    value={durationMin}
                    onChange={(e) => setDurationMin(Math.max(5, Number(e.target.value) || 25))}
                  />
                </div>
              </>
            ) : (
              <>
                {offer.workout.steps != null ? (
                  <div>
                    <label className="shadow-edit-section-label" htmlFor="shadow-act-steps">
                      Jumlah langkah
                    </label>
                    <input
                      id="shadow-act-steps"
                      type="number"
                      min={100}
                      max={60000}
                      step={500}
                      inputMode="numeric"
                      className="shadow-edit-input"
                      value={steps}
                      onChange={(e) => setSteps(Math.max(100, Number(e.target.value) || 1000))}
                    />
                  </div>
                ) : offer.workout.reps != null ? (
                  <div>
                    <label className="shadow-edit-section-label" htmlFor="shadow-act-reps">
                      Repetisi
                    </label>
                    <input
                      id="shadow-act-reps"
                      type="number"
                      min={1}
                      max={1000}
                      inputMode="numeric"
                      className="shadow-edit-input"
                      value={reps}
                      onChange={(e) => setReps(Math.max(1, Number(e.target.value) || 10))}
                    />
                  </div>
                ) : (
                  <div>
                    <label className="shadow-edit-section-label" htmlFor="shadow-act-min">
                      Durasi aktivitas (menit)
                    </label>
                    <input
                      id="shadow-act-min"
                      type="number"
                      min={5}
                      max={300}
                      inputMode="numeric"
                      className="shadow-edit-input"
                      value={durationMin}
                      onChange={(e) => setDurationMin(Math.max(5, Number(e.target.value) || 15))}
                    />
                  </div>
                )}
                {offer.workout.minutes != null && (
                  <div>
                    <span className="shadow-edit-section-label">Intensitas</span>
                    <div className="shadow-chip-row">
                      {INTENSITIES.map((it) => (
                        <button
                          key={it.key}
                          type="button"
                          className="shadow-chip-btn"
                          aria-pressed={intensity === it.key}
                          onClick={() => setIntensity(it.key)}
                        >
                          {it.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            <div className="shadow-edit-summary">
              <span>Perkiraan energi terbakar</span>
              <strong>≈ {estimatedWorkoutKcal.toLocaleString("id-ID")} kkal</strong>
            </div>

            <div className="shadow-edit-actions">
              <button
                type="button"
                className="primary-button"
                style={{ width: "100%", minHeight: 48 }}
                onClick={() =>
                  onSaveWorkout(offer, {
                    setsScale,
                    durationMin,
                    ...(offer.workout?.steps != null ? { steps } : {}),
                    ...(offer.workout?.reps != null ? { reps } : {}),
                    intensity,
                  })
                }
              >
                {offer.workout.kind === "activity" ? "Catat aktivitas ✓" : "Catat selesai ✓"}
              </button>
              {offer.workout.kind === "session" && onStartLiveWorkout && (
                <button
                  type="button"
                  className="secondary-button"
                  style={{ width: "100%", minHeight: 46 }}
                  onClick={() => onStartLiveWorkout(offer)}
                >
                  Buka di live logger
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
