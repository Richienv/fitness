export type BarcodeProduct = {
  code: string;
  name: string;
  brand: string;
  serving: string;
  basis: "g" | "ml" | "serving";
  kcal: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  sugar: number | null;
};
const number = (n: unknown): number | null =>
  typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : null;
export const validBarcode = (code: string) => /^\d{8,14}$/.test(code);
export function parseBarcodeProduct(
  raw: unknown,
  code: string,
): BarcodeProduct | null {
  if (!raw || typeof raw !== "object") return null;
  const p = (raw as { product?: Record<string, unknown> }).product;
  if (!p) return null;
  const name = String(
    p.product_name_id || p.product_name || p.product_name_en || "",
  ).trim();
  if (!name) return null;
  const n = p.nutriments as Record<string, unknown> | undefined;
  if (!n)
    return {
      code,
      name,
      brand: String(p.brands || ""),
      serving: String(p.serving_size || ""),
      basis: "g",
      kcal: null,
      protein: null,
      carbs: null,
      fat: null,
      sugar: null,
    };
  const has100 = [
    "energy-kcal",
    "energy",
    "proteins",
    "carbohydrates",
    "fat",
  ].some((k) => number(n[`${k}_100g`]) !== null);
  const suffix = has100 ? "100g" : "serving";
  const volume = /(?:\d[\d.,]*\s*(?:ml|cl|l)\b|\bml\b)/i.test(
    String(p.quantity || p.serving_size || ""),
  );
  const basis = has100 ? (volume ? "ml" : "g") : "serving";
  const kcal = number(n[`energy-kcal_${suffix}`]);
  const kj = number(n[`energy_${suffix}`]);
  return {
    code,
    name,
    brand: String(p.brands || ""),
    serving: String(p.serving_size || ""),
    basis,
    kcal: kcal ?? (kj === null ? null : kj / 4.184),
    protein: number(n[`proteins_${suffix}`]),
    carbs: number(n[`carbohydrates_${suffix}`]),
    fat: number(n[`fat_${suffix}`]),
    sugar: number(n[`sugars_${suffix}`]),
  };
}
