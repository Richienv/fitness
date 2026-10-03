"use client";
import type { ReactNode } from "react";
import FriendlySheet from "../FriendlySheet";
import NutritionSummary from "../NutritionSummary";
import PortionSlider from "./PortionSlider";
import Plate3D from "./Plate3D";
export type PortionSheetProps = {
  name: string;
  mealLabel?: string;
  per100: { kcal: number; protein: number; carbs: number; fat: number };
  delta?: { kcal: number; p: number; c: number; f: number };
  grams: number;
  onGrams: (g: number) => void;
  portionG: number;
  unit: string;
  remaining?: { protein: number; carbs: number; fat: number };
  tint?: string;
  addons?: ReactNode;
  top?: ReactNode;
  estimated?: boolean;
  unitsOnly?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};
export default function PortionSheet({
  name,
  mealLabel = "catatan makan",
  per100,
  delta,
  grams,
  onGrams,
  portionG,
  unit,
  remaining,
  tint,
  addons,
  top,
  estimated,
  unitsOnly,
  onCancel,
  onConfirm,
}: PortionSheetProps) {
  const k = grams / 100;
  const d = delta ?? { kcal: 0, p: 0, c: 0, f: 0 };
  const values = {
    kcal: Math.max(0, per100.kcal * k + d.kcal),
    protein: Math.max(0, per100.protein * k + d.p),
    carbs: Math.max(0, per100.carbs * k + d.c),
    fat: Math.max(0, per100.fat * k + d.f),
  };
  return (
    <FriendlySheet
      title={name}
      onClose={onCancel}
      footer={
        <button
          className="primary-button"
          disabled={!Number.isFinite(grams) || grams <= 0}
          onClick={onConfirm}
        >
          Tambahkan ke {mealLabel}
        </button>
      }
    >
      <p className="quiet">
        Porsi:{" "}
        {unitsOnly
          ? `${Math.round((grams / portionG) * 100) / 100} ${unit}`
          : `${Math.round(grams)} g`}
        {estimated ? " · Estimasi" : ""}
      </p>
      <NutritionSummary
        values={values}
        caption="Nutrisi untuk porsi yang dipilih"
      />
      {top}
      <PortionSlider
        grams={grams}
        onChange={onGrams}
        portionG={portionG}
        unit={unit}
        unitsOnly={unitsOnly}
      />
      {addons && (
        <details className="picker-details">
          <summary>Minyak, saus, dan tambahan</summary>
          {addons}
        </details>
      )}
      <details className="picker-details">
        <summary>Bandingkan dengan sisa nutrisi harian</summary>
        <Plate3D
          grams={grams}
          macros={values}
          remaining={remaining}
          tint={tint}
          height={210}
          nominal={unitsOnly}
        />
      </details>
    </FriendlySheet>
  );
}
