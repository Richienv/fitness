"use client";

import { useEffect, useState, type CSSProperties } from "react";
import type { MealType } from "@/lib/presets";
import { foodLabel } from "@/lib/foodLabel";
import { getIngredient, macrosFor } from "@/lib/ingredients";
import { isCustomItem, type CustomMealItem, type MealItem } from "@/lib/store";
import { haptic } from "@/lib/haptics";

const SANS = "var(--font-dm-sans), 'Plus Jakarta Sans', sans-serif";
const round1 = (x: number) => Math.round(x * 10) / 10;

const SLOT_LABELS: Record<MealType, string> = {
  breakfast: "Sarapan",
  lunch: "Siang",
  snack: "Camilan",
  dinner: "Malam",
};

const labelStyle: CSSProperties = {
  display: "block",
  fontFamily: SANS,
  fontSize: 13,
  fontWeight: 600,
  color: "var(--calm-muted)",
  marginTop: 14,
};

const inputStyle: CSSProperties = {
  width: "100%",
  marginTop: 6,
  padding: "11px 12px",
  borderRadius: 12,
  fontFamily: SANS,
  fontSize: 16,
  color: "var(--calm-text)",
  background: "#fff",
  border: "1px solid var(--calm-border)",
  boxSizing: "border-box",
};

export type LoggedItemTarget = {
  mealId: string;
  itemIndex: number;
  date: string;
  mealType: MealType;
  item: MealItem;
};

type DraftState = {
  name: string;
  mealType: MealType;
  grams: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  sugar: number;
  portionLabel?: string;
  sodium?: number;
  addedAt?: number;
};

function initialDraft(target: LoggedItemTarget): DraftState {
  const it = target.item;
  if (isCustomItem(it)) {
    return {
      name: it.name,
      mealType: target.mealType,
      grams: Math.max(0, Math.round(it.grams || 0)),
      kcal: Math.round(it.kcal || 0),
      protein: round1(it.protein || 0),
      carbs: round1(it.carbs || 0),
      fat: round1(it.fat || 0),
      sugar: round1(it.sugar ?? 0),
      portionLabel: it.portionLabel,
      sodium: it.sodium,
      addedAt: it.addedAt,
    };
  }
  const ing = getIngredient(it.id);
  const m = macrosFor(it.id, it.qty);
  const grams = ing?.gramsPerUnit ? Math.round(ing.gramsPerUnit * it.qty) : 0;
  return {
    name: ing ? foodLabel(ing) : it.id,
    mealType: target.mealType,
    grams,
    kcal: Math.round(m.kcal),
    protein: round1(m.protein),
    carbs: round1(m.carbs),
    fat: round1(m.fat),
    sugar: round1((ing?.sugar ?? 0) * it.qty),
    portionLabel: grams > 0 ? undefined : `${round1(it.qty)}×`,
    addedAt: it.addedAt,
  };
}

export default function EditMealItemSheet({
  target,
  onClose,
  onSave,
  onDelete,
}: {
  target: LoggedItemTarget | null;
  onClose: () => void;
  onSave: (
    sourceMealId: string,
    itemIndex: number,
    updatedItem: CustomMealItem,
    targetDate: string,
    targetSlot: MealType,
  ) => void;
  onDelete: (mealId: string, itemIndex: number, name: string) => void;
}) {
  const [draft, setDraft] = useState<DraftState | null>(() =>
    target ? initialDraft(target) : null,
  );
  const [baseline, setBaseline] = useState<DraftState | null>(() =>
    target ? initialDraft(target) : null,
  );
  const [lockRatio, setLockRatio] = useState(true);

  useEffect(() => {
    if (!target) {
      setDraft(null);
      setBaseline(null);
      return;
    }
    const init = initialDraft(target);
    setDraft(init);
    setBaseline(init);
    setLockRatio(true);
  }, [target]);

  if (!target || !draft || !baseline) return null;

  const scaleFromBaseline = (mult: number) => {
    haptic("tap");
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            grams: baseline.grams > 0 ? Math.round(baseline.grams * mult) : prev.grams,
            kcal: Math.round(baseline.kcal * mult),
            protein: round1(baseline.protein * mult),
            carbs: round1(baseline.carbs * mult),
            fat: round1(baseline.fat * mult),
            sugar: round1(baseline.sugar * mult),
          }
        : prev,
    );
  };

  const handleGramsChange = (nextG: number) => {
    const clean = Math.max(0, Number.isFinite(nextG) ? nextG : 0);
    setDraft((prev) => {
      if (!prev) return prev;
      if (lockRatio && prev.grams > 0 && clean > 0) {
        const s = clean / prev.grams;
        return {
          ...prev,
          grams: clean,
          kcal: Math.round(prev.kcal * s),
          protein: round1(prev.protein * s),
          carbs: round1(prev.carbs * s),
          fat: round1(prev.fat * s),
          sugar: round1(prev.sugar * s),
        };
      }
      return { ...prev, grams: clean };
    });
  };

  const handleKcalChange = (nextK: number) => {
    const clean = Math.max(0, Number.isFinite(nextK) ? nextK : 0);
    setDraft((prev) => {
      if (!prev) return prev;
      if (lockRatio && prev.kcal > 0 && clean > 0) {
        const s = clean / prev.kcal;
        return {
          ...prev,
          kcal: clean,
          protein: round1(prev.protein * s),
          carbs: round1(prev.carbs * s),
          fat: round1(prev.fat * s),
          sugar: round1(prev.sugar * s),
          grams: prev.grams > 0 ? Math.round(prev.grams * s) : prev.grams,
        };
      }
      return { ...prev, kcal: clean };
    });
  };

  const save = () => {
    const cleanName = draft.name.replace(/\s+/g, " ").trim();
    if (!cleanName) {
      haptic("error");
      return;
    }
    const item: CustomMealItem = {
      custom: true,
      name: cleanName,
      grams: Math.max(0, Math.round(draft.grams)),
      kcal: Math.max(0, Math.round(draft.kcal)),
      protein: Math.max(0, round1(draft.protein)),
      carbs: Math.max(0, round1(draft.carbs)),
      fat: Math.max(0, round1(draft.fat)),
      ...(draft.sugar > 0 ? { sugar: Math.max(0, round1(draft.sugar)) } : {}),
      ...(draft.grams <= 0 && draft.portionLabel ? { portionLabel: draft.portionLabel } : {}),
      ...(draft.sodium != null ? { sodium: draft.sodium } : {}),
      ...(draft.addedAt != null ? { addedAt: draft.addedAt } : {}),
    };
    onSave(target.mealId, target.itemIndex, item, target.date, draft.mealType);
  };

  return (
    <div
      className="mk-sheet-backdrop editor"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="mk-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mk-edit-logged-title"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
      >
        <h2 id="mk-edit-logged-title">Edit makanan</h2>

        <label style={labelStyle} htmlFor="edit-logged-name">
          Nama makanan
        </label>
        <input
          id="edit-logged-name"
          type="text"
          value={draft.name}
          maxLength={120}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          style={inputStyle}
        />

        <label style={labelStyle}>Waktu makan</label>
        <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
          {(["breakfast", "lunch", "snack", "dinner"] as const).map((mt) => {
            const active = draft.mealType === mt;
            return (
              <button
                key={mt}
                type="button"
                onClick={() => {
                  haptic("tap");
                  setDraft({ ...draft, mealType: mt });
                }}
                style={{
                  flex: 1,
                  minHeight: 42,
                  padding: "8px 6px",
                  borderRadius: 12,
                  fontFamily: SANS,
                  fontSize: 13.5,
                  fontWeight: active ? 700 : 500,
                  cursor: "pointer",
                  border: active
                    ? "1px solid var(--calm-accent)"
                    : "1px solid var(--calm-border)",
                  background: active ? "var(--calm-accent-soft)" : "#fff",
                  color: active ? "var(--calm-accent)" : "var(--calm-text)",
                }}
              >
                {SLOT_LABELS[mt]}
              </button>
            );
          })}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            marginTop: 14,
          }}
        >
          <span style={{ ...labelStyle, marginTop: 0 }}>Skala cepat</span>
          <button
            type="button"
            onClick={() => setLockRatio((v) => !v)}
            style={{
              fontFamily: SANS,
              fontSize: 12.5,
              fontWeight: 650,
              minHeight: 32,
              padding: "4px 11px",
              borderRadius: 999,
              cursor: "pointer",
              color: lockRatio ? "var(--calm-accent)" : "var(--calm-muted)",
              background: lockRatio ? "var(--calm-accent-soft)" : "#fff",
              border: lockRatio
                ? "1px solid var(--calm-accent)"
                : "1px solid var(--calm-border)",
            }}
          >
            {lockRatio ? "Skala otomatis" : "Ubah bebas"}
          </button>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          {[0.5, 1, 1.5, 2].map((mult) => (
            <button
              key={mult}
              type="button"
              onClick={() => scaleFromBaseline(mult)}
              className="secondary-button"
              style={{ flex: 1, minHeight: 38, fontSize: 13 }}
            >
              {mult}×
            </button>
          ))}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 10,
            marginTop: 8,
          }}
        >
          <div>
            <label style={labelStyle} htmlFor="edit-logged-grams">
              Porsi (g)
            </label>
            <input
              id="edit-logged-grams"
              type="number"
              inputMode="decimal"
              min={0}
              value={draft.grams}
              onChange={(e) => handleGramsChange(parseFloat(e.target.value))}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle} htmlFor="edit-logged-kcal">
              Kalori (kkal)
            </label>
            <input
              id="edit-logged-kcal"
              type="number"
              inputMode="numeric"
              min={0}
              value={draft.kcal}
              onChange={(e) => handleKcalChange(parseFloat(e.target.value))}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle} htmlFor="edit-logged-protein">
              Protein (g)
            </label>
            <input
              id="edit-logged-protein"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.1"
              value={draft.protein}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  protein: Math.max(0, parseFloat(e.target.value) || 0),
                })
              }
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle} htmlFor="edit-logged-carbs">
              Karbo (g)
            </label>
            <input
              id="edit-logged-carbs"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.1"
              value={draft.carbs}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  carbs: Math.max(0, parseFloat(e.target.value) || 0),
                })
              }
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle} htmlFor="edit-logged-fat">
              Lemak (g)
            </label>
            <input
              id="edit-logged-fat"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.1"
              value={draft.fat}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  fat: Math.max(0, parseFloat(e.target.value) || 0),
                })
              }
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle} htmlFor="edit-logged-sugar">
              Gula (g)
            </label>
            <input
              id="edit-logged-sugar"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.1"
              value={draft.sugar}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  sugar: Math.max(0, parseFloat(e.target.value) || 0),
                })
              }
              style={inputStyle}
            />
          </div>
        </div>

        <div style={{ display: "flex", gap: 9, marginTop: 18 }}>
          <button
            type="button"
            className="mk-danger"
            style={{ minHeight: 48, paddingInline: 14, borderRadius: 12 }}
            onClick={() => {
              onClose();
              onDelete(target.mealId, target.itemIndex, draft.name || "Makanan");
            }}
          >
            Hapus
          </button>
          <button
            type="button"
            className="secondary-button"
            style={{ flex: 1, minHeight: 48 }}
            onClick={onClose}
          >
            Batal
          </button>
          <button
            type="button"
            className="primary-button"
            style={{ flex: 1, minHeight: 48 }}
            disabled={!draft.name.trim()}
            onClick={save}
          >
            Simpan
          </button>
        </div>
      </div>
    </div>
  );
}
