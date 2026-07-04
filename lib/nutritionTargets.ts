/**
 * Daily nutrient benchmarks for the EXTENDED nutrients beyond the core
 * kcal/protein/carbs/fat (those live in lib/settings.ts TARGETS). Values
 * are evidence-based defaults for a 24yo active male training 5–6×/week,
 * editable by the user in Settings.
 *
 * kind "hit"  = reach or exceed (more is the achievement)
 * kind "cap"  = stay under (over = warning)
 *
 * Sources are shown inline in Settings so the numbers are trustworthy.
 */

import { scopedKey } from "./userScope";

export type NutrientKind = "hit" | "cap";

export type MicroKey =
  | "fiber"
  | "sugar"
  | "na"
  | "k"
  | "mg"
  | "fe"
  | "zn"
  | "ca"
  | "omega3";

export type NutrientDef = {
  key: MicroKey;
  label: string;
  unit: string;
  kind: NutrientKind;
  /** Decimal places to display the value at. */
  dp: number;
  source: string;
};

export const MICRO_DEFS: NutrientDef[] = [
  { key: "fiber",  label: "FIBER",     unit: "g",  kind: "hit", dp: 0, source: "US DRI/IOM adult-male AI" },
  { key: "sugar",  label: "SUGAR",     unit: "g",  kind: "cap", dp: 0, source: "AHA added-sugar limit (men)" },
  { key: "na",     label: "SODIUM",    unit: "mg", kind: "cap", dp: 0, source: "NASEM 2019 CDRR" },
  { key: "k",      label: "POTASSIUM", unit: "mg", kind: "hit", dp: 0, source: "US DRI adult-male AI" },
  { key: "mg",     label: "MAGNESIUM", unit: "mg", kind: "hit", dp: 0, source: "US DRI/RDA male 19–30" },
  { key: "fe",     label: "IRON",      unit: "mg", kind: "hit", dp: 0, source: "US DRI/RDA adult male" },
  { key: "zn",     label: "ZINC",      unit: "mg", kind: "hit", dp: 0, source: "US DRI/RDA adult male" },
  { key: "ca",     label: "CALCIUM",   unit: "mg", kind: "hit", dp: 0, source: "US DRI/RDA male 19–50" },
  { key: "omega3", label: "OMEGA-3",   unit: "g",  kind: "hit", dp: 1, source: "general-health EPA+DHA target" },
];

export type MicroTargets = Record<MicroKey, number>;

export const DEFAULT_MICRO_TARGETS: MicroTargets = {
  fiber: 38,
  sugar: 36,
  na: 2300,
  k: 3400,
  mg: 420,
  fe: 8,
  zn: 11,
  ca: 1000,
  omega3: 2,
};

const KEY = "richie.microTargets.v1";

export function getMicroTargets(): MicroTargets {
  if (typeof window === "undefined") return { ...DEFAULT_MICRO_TARGETS };
  try {
    const raw = window.localStorage.getItem(scopedKey(KEY));
    if (!raw) return { ...DEFAULT_MICRO_TARGETS };
    const parsed = JSON.parse(raw) as Partial<MicroTargets>;
    return { ...DEFAULT_MICRO_TARGETS, ...parsed };
  } catch {
    return { ...DEFAULT_MICRO_TARGETS };
  }
}

export function setMicroTargets(next: MicroTargets): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(scopedKey(KEY), JSON.stringify(next));
}

export function patchMicroTargets(patch: Partial<MicroTargets>): MicroTargets {
  const next = { ...getMicroTargets(), ...patch };
  setMicroTargets(next);
  return next;
}

export function resetMicroTargets(): MicroTargets {
  setMicroTargets({ ...DEFAULT_MICRO_TARGETS });
  return { ...DEFAULT_MICRO_TARGETS };
}
