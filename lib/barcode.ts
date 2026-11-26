import type { LabelKey, NutritionLabel } from "./nutritionLabel.ts";

export type BarcodeProduct = {
  code: string;
  name: string;
  nameMissing?: boolean;
  brand: string;
  serving: string;
  /** Parsed gram or ml weight of one declared serving when available (e.g. 30 for "30 g"). */
  servingSizeG?: number | null;
  basis: "g" | "ml" | "serving";
  kcal: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  sugar: number | null;
  sodium?: number | null;
  salt?: number | null;
  saturatedFat?: number | null;
  fiber?: number | null;
  source?: "cache" | "openfoodfacts" | "user_confirmed" | "indo_pack";
};

export type BarcodeLabelConflict = {
  key: LabelKey;
  label: string;
  barcodeValue: number;
  scannedValue: number;
  unit: string;
};

const number = (n: unknown): number | null => {
  if (typeof n === "string") {
    const text = n.trim();
    if (!/^(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:e[+-]?\d+)?$/i.test(text)) return null;
    n = Number(text.replace(",", "."));
  }
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : null;
};

const text = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

export const validBarcode = (code: string) => /^\d{8,14}$/.test(code);

/** Validate GS1 EAN-13 / EAN-8 / UPC-A / GTIN-14 check digit so live scanners
 *  never lock onto partial or misread barcode frames. */
export function isValidEanChecksum(rawCode: string): boolean {
  const code = rawCode.replace(/\s/g, "");
  if (!/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(code)) return false;
  const digits = code.split("").map(Number);
  const check = digits[digits.length - 1];
  const body = digits.slice(0, -1);
  // Right-to-left alternating weights 3, 1, 3, 1 ... (GS1 standard)
  let sum = 0;
  for (let i = body.length - 1, pos = 0; i >= 0; i--, pos++) {
    sum += body[i] * (pos % 2 === 0 ? 3 : 1);
  }
  const expected = (10 - (sum % 10)) % 10;
  return expected === check;
}

/** Extract gram/ml mass from a serving string such as "1 sachet (30 g)" or "250ml". */
export function parseServingMass(raw: string): number | null {
  if (!raw) return null;
  const match = raw.match(/(\d+(?:[.,]\d+)?)\s*(?:ml|g|gr|gram|grams|克|毫升)\b/i);
  if (!match) return null;
  const val = Number(match[1].replace(",", "."));
  return Number.isFinite(val) && val > 0 ? val : null;
}

/** Require N consecutive matching valid reads within `maxGapMs` before locking a barcode.
 *  When `instantOnChecksum` is true, GS1 checksum-verified EAN-13/EAN-8/UPC-A codes lock in 1 frame. */
export function createBarcodeStabilizer(
  requiredMatches = 2,
  maxGapMs = 2500,
  instantOnChecksum = false,
) {
  let lastCode = "";
  let count = 0;
  let lastAt = 0;
  return {
    push(rawCode: string, now = Date.now()): string | null {
      const code = rawCode.replace(/\s/g, "");
      if (!validBarcode(code)) return null;
      if (instantOnChecksum && isValidEanChecksum(code)) {
        lastCode = code;
        count = requiredMatches;
        lastAt = now;
        return code;
      }
      if (code === lastCode && now - lastAt <= maxGapMs) {
        count++;
      } else {
        lastCode = code;
        count = 1;
      }
      lastAt = now;
      return count >= requiredMatches ? code : null;
    },
    reset() {
      lastCode = "";
      count = 0;
      lastAt = 0;
    },
  };
}

export function parseBarcodeProduct(
  raw: unknown,
  code: string,
): BarcodeProduct | null {
  if (!raw || typeof raw !== "object") return null;
  const p = (raw as { product?: unknown }).product;
  if (!p || typeof p !== "object" || Array.isArray(p) || !Object.keys(p).length)
    return null;
  const fields = p as Record<string, unknown>;
  const names = [
    fields.product_name_id,
    fields.product_name,
    fields.product_name_zh,
    fields.product_name_zh_cn,
    fields.product_name_zh_tw,
    fields.product_name_en,
    fields.generic_name_id,
    fields.generic_name,
    fields.generic_name_zh,
    fields.generic_name_en,
    fields.abbreviated_product_name,
  ];
  const knownName =
    names.map(text).find(Boolean) ||
    Object.entries(fields)
      .filter(([key]) => key.startsWith("product_name_"))
      .map(([, value]) => text(value))
      .find(Boolean);
  const name = knownName || `Produk ${code}`;
  const identity = { code, name, ...(!knownName ? { nameMissing: true } : {}) };
  const serving = text(fields.serving_size);
  const servingQty = number(fields.serving_quantity) ?? parseServingMass(serving);
  const n = fields.nutriments as Record<string, unknown> | undefined;
  if (!n)
    return {
      ...identity,
      brand: text(fields.brands),
      serving,
      ...(servingQty !== null ? { servingSizeG: servingQty } : {}),
      basis: "g",
      kcal: null,
      protein: null,
      carbs: null,
      fat: null,
      sugar: null,
    };
  const declaredBasis = text(fields.nutrition_data_per);
  const has100 =
    declaredBasis === "100g" ||
    declaredBasis === "100ml" ||
    [
      "energy-kcal",
      "energy",
      "energy-kj",
      "proteins",
      "carbohydrates",
      "fat",
      "sugars",
    ].some((k) => number(n[`${k}_100g`]) !== null);
  const suffix = has100 ? "100g" : "serving";
  const volume =
    declaredBasis === "100ml" ||
    (declaredBasis !== "100g" &&
      (/^(?:ml|cl|dl|l)$/i.test(text(fields.product_quantity_unit)) ||
        /(?:\d[\d.,]*\s*(?:ml|cl|dl|l)\b|\bml\b|毫升|公升|升)/i.test(
          text(fields.quantity) || serving,
        )));
  const basis = has100 ? (volume ? "ml" : "g") : "serving";
  const kcal = number(n[`energy-kcal_${suffix}`]);
  const kj = number(n[`energy-kj_${suffix}`]) ?? number(n[`energy_${suffix}`]);
  // Open Food Facts reports sodium in grams (e.g. 0.25 g = 250 mg).
  const sodiumG = number(n[`sodium_${suffix}`]);
  const saltG = number(n[`salt_${suffix}`]);
  const satFat = number(n[`saturated-fat_${suffix}`]);
  const fiber = number(n[`fiber_${suffix}`]);
  return {
    ...identity,
    brand: text(fields.brands),
    serving,
    ...(servingQty !== null ? { servingSizeG: servingQty } : {}),
    basis,
    kcal: kcal ?? (kj === null ? null : kj / 4.184),
    protein: number(n[`proteins_${suffix}`]),
    carbs: number(n[`carbohydrates_${suffix}`]),
    fat: number(n[`fat_${suffix}`]),
    sugar: number(n[`sugars_${suffix}`]),
    ...(sodiumG !== null ? { sodium: Math.round(sodiumG * 1000 * 10) / 10 } : {}),
    ...(saltG !== null ? { salt: saltG } : {}),
    ...(satFat !== null ? { saturatedFat: satFat } : {}),
    ...(fiber !== null ? { fiber } : {}),
    source: "openfoodfacts",
  };
}

const CONFLICT_META: { key: LabelKey; label: string; unit: string; absTol: number }[] = [
  { key: "kcal", label: "Kalori", unit: "kkal", absTol: 15 },
  { key: "protein", label: "Protein", unit: "g", absTol: 1.5 },
  { key: "carbs", label: "Karbohidrat", unit: "g", absTol: 2 },
  { key: "fat", label: "Lemak", unit: "g", absTol: 1.5 },
];

/** Compare a barcode database product against a freshly scanned nutrition label
 *  when both can be expressed on the same basis (per 100 g/ml or per serving). */
export function detectBarcodeLabelConflicts(
  product: BarcodeProduct,
  label: NutritionLabel,
): BarcodeLabelConflict[] {
  if (!label.basis) return [];
  // Scale barcode product values into the label's basis so comparison is apples-to-apples.
  let barcodeScale: number | null = null;
  if (
    (product.basis === "g" || product.basis === "ml") &&
    (label.basis.unit === "g" || label.basis.unit === "ml")
  ) {
    barcodeScale = label.basis.amount / 100;
  } else if (product.basis === "serving" && label.basis.unit === "serving") {
    barcodeScale = label.basis.amount;
  } else if (
    (product.basis === "g" || product.basis === "ml") &&
    label.basis.unit === "serving"
  ) {
    const mass = label.servingSize?.amount ?? product.servingSizeG ?? null;
    if (mass && mass > 0) barcodeScale = (mass / 100) * label.basis.amount;
  } else if (
    product.basis === "serving" &&
    (label.basis.unit === "g" || label.basis.unit === "ml")
  ) {
    const mass = product.servingSizeG ?? label.servingSize?.amount ?? null;
    if (mass && mass > 0) barcodeScale = label.basis.amount / mass;
  }
  if (barcodeScale === null || !Number.isFinite(barcodeScale) || barcodeScale <= 0) {
    return [];
  }
  const conflicts: BarcodeLabelConflict[] = [];
  for (const field of CONFLICT_META) {
    const dbRaw = product[field.key as keyof BarcodeProduct];
    const scanned = label.values[field.key];
    if (typeof dbRaw !== "number" || scanned === null) continue;
    const dbVal = Math.round(dbRaw * barcodeScale * 10) / 10;
    const diff = Math.abs(dbVal - scanned);
    const relTol = Math.max(dbVal, scanned) * 0.15;
    if (diff > Math.max(field.absTol, relTol)) {
      conflicts.push({
        key: field.key,
        label: field.label,
        barcodeValue: dbVal,
        scannedValue: Math.round(scanned * 10) / 10,
        unit: field.unit,
      });
    }
  }
  return conflicts;
}
