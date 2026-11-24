// Strict validation & normalization layer for nutrition-label extraction
// (both Stage 1 deterministic parser and Stage 2 LLM structured JSON fallback).
// Pure module: safe to import in server API routes, browser UI, and Node tests.
import {
  emptyLabelValues,
  type LabelValues,
  type NutritionLabel,
  type ServingSize,
} from "./nutritionLabel.ts";

export type NutritionBasisName =
  | "per_100g"
  | "per_100ml"
  | "per_serving"
  | "unknown";

export type ServingUnitName = "g" | "ml" | "piece" | "sachet" | null;

export type ParsedNutritionPayload = {
  product_name: string | null;
  brand: string | null;
  serving_size: number | null;
  serving_unit: ServingUnitName;
  nutrition_basis: NutritionBasisName;
  energy_kcal: number | null;
  energy_kj: number | null;
  protein_g: number | null;
  fat_g: number | null;
  saturated_fat_g: number | null;
  trans_fat_g?: number | null;
  carbohydrate_g: number | null;
  sugar_g: number | null;
  fiber_g: number | null;
  sodium_mg: number | null;
  salt_g: number | null;
  confidence: number;
  warnings: string[];
};

export type ValidatedNutritionResult = {
  payload: ParsedNutritionPayload;
  label: NutritionLabel;
  productName: string | null;
  brand: string | null;
  confidence: number;
  rejectedFields: string[];
};

/** Parse a dirty numeric value (e.g. "12,5 g", 18.0, null) into a non-negative finite number or null. */
export function cleanNumeric(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 ? value : null;
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(",", ".");
  if (!trimmed || trimmed.startsWith("-")) return null;
  const match = trimmed.match(/^\D{0,2}(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function cleanText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 120) : null;
}

function normalizeBasis(value: unknown): NutritionBasisName {
  if (typeof value !== "string") return "unknown";
  const v = value.toLowerCase().replace(/[\s-]+/g, "_").trim();
  if (v === "per_100g" || v === "100g") return "per_100g";
  if (v === "per_100ml" || v === "100ml") return "per_100ml";
  if (v === "per_serving" || v === "serving" || v === "per_sajian")
    return "per_serving";
  return "unknown";
}

function normalizeServingUnit(value: unknown): ServingUnitName {
  if (typeof value !== "string") return null;
  const v = value.toLowerCase().trim();
  if (v === "g" || v === "gr" || v === "gram" || v === "grams" || v === "克")
    return "g";
  if (v === "ml" || v === "毫升") return "ml";
  if (v === "piece" || v === "pcs" || v === "buah" || v === "keping")
    return "piece";
  if (v === "sachet" || v === "bungkus" || v === "pak" || v === "pack")
    return "sachet";
  return null;
}

const round4 = (n: number) => Math.round(n * 10000) / 10000;

/** Strict validator for LLM / external nutrition extraction payloads.
 *  Rejects out-of-range values instead of blindly trusting them, converts kJ → kcal
 *  when kcal is absent, and emits human-readable Indonesian warnings. */
export function validateParsedNutrition(
  raw: unknown,
  ocrText = "",
): ValidatedNutritionResult | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;

  const basis = normalizeBasis(o.nutrition_basis);
  const servingSize = cleanNumeric(o.serving_size);
  const servingUnit = normalizeServingUnit(o.serving_unit);
  const warnings: string[] = [];
  const rejectedFields: string[] = [];

  if (Array.isArray(o.warnings)) {
    for (const w of o.warnings) {
      if (typeof w === "string" && w.trim()) warnings.push(w.trim());
    }
  }

  let energyKcal = cleanNumeric(o.energy_kcal);
  const energyKj = cleanNumeric(o.energy_kj);

  // Convert kJ to kcal only when kcal was not directly reported.
  if (energyKcal === null && energyKj !== null) {
    energyKcal = round4(energyKj / 4.184);
  }

  const maxKcal = basis === "per_serving" ? 3500 : 950;
  if (energyKcal !== null && energyKcal > maxKcal) {
    rejectedFields.push("energy_kcal");
    warnings.push(
      "Energi berada di luar rentang wajar — periksa kJ/kkal dan porsi acuan pada label.",
    );
    energyKcal = null;
  }

  const macroCap =
    basis === "per_100g" || basis === "per_100ml"
      ? 100
      : servingSize && (servingUnit === "g" || servingUnit === "ml")
        ? servingSize * 1.15
        : 500;

  const checkMacro = (field: string, value: unknown): number | null => {
    const n = cleanNumeric(value);
    if (n === null) return null;
    if (n > macroCap) {
      rejectedFields.push(field);
      warnings.push(
        `Nilai ${field} melebihi batas wajar (${Math.round(macroCap)} g) — periksa titik desimal.`,
      );
      return null;
    }
    return round4(n);
  };

  const protein = checkMacro("protein_g", o.protein_g);
  const fat = checkMacro("fat_g", o.fat_g);
  const saturatedFat = checkMacro("saturated_fat_g", o.saturated_fat_g);
  const transFat = checkMacro("trans_fat_g", o.trans_fat_g);
  const carbs = checkMacro("carbohydrate_g", o.carbohydrate_g);
  const sugar = checkMacro("sugar_g", o.sugar_g);
  const fiber = checkMacro("fiber_g", o.fiber_g);

  let sodium = cleanNumeric(o.sodium_mg);
  if (sodium !== null && sodium > 50000) {
    rejectedFields.push("sodium_mg");
    warnings.push("Natrium di luar rentang wajar — periksa satuan mg/g.");
    sodium = null;
  } else if (sodium !== null && sodium > (basis === "per_serving" ? 3000 : 5000)) {
    warnings.push(
      "Natrium sangat tinggi — pastikan satuannya mg dan bukan g pada label.",
    );
  }

  let salt = cleanNumeric(o.salt_g);
  if (salt !== null && salt > 100) {
    rejectedFields.push("salt_g");
    salt = null;
  }

  // Business-rule cross checks
  if (basis === "unknown") {
    warnings.push(
      "Porsi acuan belum terbaca. Pilih per 100 g, per 100 ml, atau per sajian sesuai label.",
    );
  }
  if (basis === "per_serving" && servingSize === null) {
    warnings.push(
      "Label memakai per sajian tetapi takaran saji belum terbaca — jangan otomatis dianggap per 100 g.",
    );
  }
  if (
    energyKcal !== null &&
    energyKcal > 30 &&
    protein === null &&
    fat === null &&
    carbs === null
  ) {
    warnings.push(
      "Energi terbaca, tetapi protein, lemak, dan karbohidrat belum ditemukan.",
    );
  }
  if (
    energyKcal !== null &&
    energyKcal > 15 &&
    protein === 0 &&
    fat === 0 &&
    carbs === 0
  ) {
    warnings.push(
      "Energi tinggi tetapi semua makro 0 g — cocokkan ulang dengan foto label.",
    );
  }
  if (sugar !== null && carbs !== null && sugar > carbs) {
    warnings.push("Gula terbaca lebih besar dari karbohidrat. Periksa kedua angka.");
  }
  if (saturatedFat !== null && fat !== null && saturatedFat > fat) {
    warnings.push("Lemak jenuh terbaca lebih besar dari lemak total. Periksa kedua angka.");
  }
  if (
    [energyKcal, protein, carbs, fat].every((n) => n !== null)
  ) {
    const est = protein! * 4 + carbs! * 4 + fat! * 9;
    if (Math.abs(energyKcal! - est) > Math.max(50, Math.max(energyKcal!, est) * 0.3)) {
      warnings.push(
        "Energi jauh berbeda dari jumlah makro. Periksa kJ/kkal dan titik desimal.",
      );
    }
  }

  const rawConfidence = cleanNumeric(o.confidence);
  const confidence =
    rawConfidence === null
      ? 75
      : rawConfidence <= 1
        ? Math.round(rawConfidence * 100)
        : Math.min(100, Math.round(rawConfidence));
  if (confidence < 75) {
    warnings.push(
      "Keyakinan pembacaan rendah — pastikan angka cocok dengan foto kemasan.",
    );
  }

  const values: LabelValues = {
    ...emptyLabelValues(),
    kcal: energyKcal === null ? null : round4(energyKcal),
    protein,
    carbs,
    fat,
    sugar,
    sodium: sodium === null ? null : round4(sodium),
    salt: salt === null ? null : round4(salt),
    saturatedFat,
    transFat,
    fiber,
  };

  const labelBasis: NutritionLabel["basis"] =
    basis === "per_100g"
      ? { amount: 100, unit: "g" }
      : basis === "per_100ml"
        ? { amount: 100, unit: "ml" }
        : basis === "per_serving"
          ? { amount: 1, unit: "serving" }
          : null;

  const parsedServingSize: ServingSize | null =
    servingSize !== null && (servingUnit === "g" || servingUnit === "ml")
      ? { amount: servingSize, unit: servingUnit }
      : null;

  const dedupedWarnings = [...new Set(warnings)];
  const payload: ParsedNutritionPayload = {
    product_name: cleanText(o.product_name),
    brand: cleanText(o.brand),
    serving_size: servingSize,
    serving_unit: servingUnit,
    nutrition_basis: basis,
    energy_kcal: values.kcal,
    energy_kj: energyKj,
    protein_g: values.protein,
    fat_g: values.fat,
    saturated_fat_g: values.saturatedFat,
    trans_fat_g: values.transFat,
    carbohydrate_g: values.carbs,
    sugar_g: values.sugar,
    fiber_g: values.fiber,
    sodium_mg: values.sodium,
    salt_g: values.salt,
    confidence: confidence / 100,
    warnings: dedupedWarnings,
  };

  const label: NutritionLabel = {
    values,
    basis: labelBasis,
    basisAmountHint:
      labelBasis?.amount ?? (servingSize && servingSize > 0 ? servingSize : null),
    ...(parsedServingSize ? { servingSize: parsedServingSize } : {}),
    evidence: {},
    warnings: dedupedWarnings,
    text: ocrText,
    energyKj,
  };

  return {
    payload,
    label,
    productName: payload.product_name,
    brand: payload.brand,
    confidence,
    rejectedFields,
  };
}

/** Shared strict JSON system prompt for Stage 2 LLM nutrition-label parsing. */
export const NUTRITION_LLM_SYSTEM_PROMPT = `You are a nutrition-label parsing engine for Indonesian, Chinese (Simplified & Traditional), and English packaged foods.

Extract nutrition facts from OCR text (with optional bounding boxes and cropped image) and return ONLY valid JSON matching this exact schema:
{
  "product_name": string | null,
  "brand": string | null,
  "serving_size": number | null,
  "serving_unit": "g" | "ml" | "piece" | "sachet" | null,
  "nutrition_basis": "per_100g" | "per_100ml" | "per_serving" | "unknown",
  "energy_kcal": number | null,
  "energy_kj": number | null,
  "protein_g": number | null,
  "fat_g": number | null,
  "saturated_fat_g": number | null,
  "trans_fat_g": number | null,
  "carbohydrate_g": number | null,
  "sugar_g": number | null,
  "fiber_g": number | null,
  "sodium_mg": number | null,
  "salt_g": number | null,
  "confidence": number,
  "warnings": string[]
}

Rules:
- Never invent or guess unreadable numbers; set missing fields to null.
- Never use NRV%, %AKG, or %DV percentages as nutrient amounts.
- Distinguish per_100g, per_100ml, and per_serving accurately; on two-column tables pick the primary printed column matching nutrition_basis.
- Indonesian labels: "Informasi Nilai Gizi", "Takaran Saji", "Energi Total" (ignore "Energi dari Lemak"), "Lemak Total", "Karbohidrat Total", "Gula", "Natrium".
- Chinese labels (GB 28050): "营养成分表", "每100克"/"每100毫升"/"每份", "能量" (usually kJ), "蛋白质", "脂肪", "碳水化合物", "钠" (mg).
- Do not confuse sodium_mg (mg) and salt_g (g). Keep them separate.
- If energy is printed in kJ only, set energy_kj and leave energy_kcal null (the validator handles conversion).
- Set confidence between 0 and 1. Return concise Indonesian warnings in "warnings" if anything is ambiguous or blurry.`;
