import {
  LABEL_KEYS,
  type NutritionLabel,
  type LabelKey,
} from "./nutritionLabel.ts";
import type { ImageMethod } from "./nutritionPreprocess.ts";
export const CORE_NUTRIENTS = ["kcal", "protein", "carbs", "fat"] as const;
export type VariantPrediction = {
  method: ImageMethod;
  confidence: number;
  label: NutritionLabel;
  elapsedMs: number;
  preprocessMs: number;
};
export function nutritionCoreCount(label: NutritionLabel) {
  return CORE_NUTRIENTS.filter((key) => label.values[key] !== null).length;
}
function contradictions(label: NutritionLabel) {
  const v = label.values;
  return (
    Number(v.sugar !== null && v.carbs !== null && v.sugar > v.carbs) +
    Number(
      v.saturatedFat !== null && v.fat !== null && v.saturatedFat > v.fat,
    ) +
    Number(
      label.basis?.unit === "g" &&
        [v.protein, v.carbs, v.fat].every((n) => n !== null) &&
        v.protein! + v.carbs! + v.fat! > label.basis.amount * 1.1,
    )
  );
}
function hasUnassignedAmountRow(label: NutritionLabel) {
  return label.text
    .split("\n")
    .some(
      (line) =>
        !Object.values(label.evidence).includes(line.trim()) &&
        /^[\s·-]*\d+(?:[.,]\d+)?\s*(?:千焦耳?|kJ|kcal|毫克|mg|克|g)(?![a-z])/i.test(
          line,
        ),
    );
}
/** Rank coverage and plausible amounts together with recognition confidence. */
export function nutritionReadScore(read: VariantPrediction) {
  const extra = LABEL_KEYS.filter(
    (key) =>
      !CORE_NUTRIENTS.includes(key as (typeof CORE_NUTRIENTS)[number]) &&
      read.label.values[key] !== null,
  ).length;
  const energyWarning = read.label.warnings.some((w) =>
    w.startsWith("Energi jauh berbeda"),
  );
  const unclear = read.label.warnings.some((w) => w.includes("kurang jelas"));
  return (
    nutritionCoreCount(read.label) * 15 +
    (read.label.basis ? 10 : 0) +
    Math.max(0, Math.min(100, read.confidence)) * 0.2 +
    Math.min(6, extra) -
    Number(hasUnassignedAmountRow(read.label)) * 4 -
    contradictions(read.label) * 80 -
    Number(energyWarning) * 25 -
    Number(unclear) * 3
  );
}
export function labelNeedsRescue(read: VariantPrediction) {
  // An unreadable header alone needs a human unit choice, not repeated filtering.
  return (
    nutritionCoreCount(read.label) < 4 ||
    read.confidence < 85 ||
    read.label.warnings.some(
      (w) => !w.startsWith("Porsi acuan belum terbaca"),
    ) ||
    hasUnassignedAmountRow(read.label)
  );
}
export function bestNutritionPrediction(reads: VariantPrediction[]) {
  if (!reads.length) throw new Error("Belum ada hasil pembacaan.");
  // Strict comparison preserves the original when quality is equal.
  const winner = reads.reduce((best, next) =>
    nutritionReadScore(next) > nutritionReadScore(best) ? next : best,
  );
  const conflicts = new Set<LabelKey>();
  for (const other of reads) {
    if (
      other === winner ||
      other.confidence < 60 ||
      nutritionCoreCount(other.label) < 2
    )
      continue;
    for (const key of LABEL_KEYS) {
      const a = winner.label.values[key],
        b = other.label.values[key];
      if (a !== null && b !== null && Math.abs(a - b) > 0.01)
        conflicts.add(key);
    }
  }
  const basisConflict = reads.some(
    (other) =>
      other !== winner &&
      other.confidence >= 60 &&
      other.label.basis &&
      winner.label.basis &&
      JSON.stringify(other.label.basis) !== JSON.stringify(winner.label.basis),
  );
  return {
    winner,
    label: {
      ...winner.label,
      warnings: [
        ...winner.label.warnings,
        ...(conflicts.size
          ? [
              "Angka berbeda antar versi gambar. Cocokkan dengan foto asli sebelum menambahkan.",
            ]
          : []),
        ...(basisConflict
          ? [
              "Porsi acuan berbeda antar versi gambar. Periksa satuan dan jumlahnya.",
            ]
          : []),
      ],
    },
    conflicts: [...conflicts],
    basisConflict,
  };
}
