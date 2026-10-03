export type BarcodeProduct = {
  code: string;
  name: string;
  nameMissing?: boolean;
  brand: string;
  serving: string;
  basis: "g" | "ml" | "serving";
  kcal: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  sugar: number | null;
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
  const n = fields.nutriments as Record<string, unknown> | undefined;
  if (!n)
    return {
      ...identity,
      brand: text(fields.brands),
      serving: text(fields.serving_size),
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
          text(fields.quantity) || text(fields.serving_size),
        )));
  const basis = has100 ? (volume ? "ml" : "g") : "serving";
  const kcal = number(n[`energy-kcal_${suffix}`]);
  const kj = number(n[`energy-kj_${suffix}`]) ?? number(n[`energy_${suffix}`]);
  return {
    ...identity,
    brand: text(fields.brands),
    serving: text(fields.serving_size),
    basis,
    kcal: kcal ?? (kj === null ? null : kj / 4.184),
    protein: number(n[`proteins_${suffix}`]),
    carbs: number(n[`carbohydrates_${suffix}`]),
    fat: number(n[`fat_${suffix}`]),
    sugar: number(n[`sugars_${suffix}`]),
  };
}
