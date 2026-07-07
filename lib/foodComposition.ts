// Pure, number-based display-layer helpers for food-composition data.
//
// These operate on the *display* layer: plain numbers. Prisma stores nutrients
// as Decimal; convert at the boundary with Number() before calling these.
// NULL propagation is strict — a null input yields null, NEVER 0. Callers rely
// on this to keep "unknown" distinct from "zero".

/** Accepts a Prisma Decimal-like object, number, or null and returns a plain
 *  number | null. Used to cross the Decimal → display boundary. */
export function toNum(x: number | { toString(): string } | null | undefined): number | null {
  if (x == null) return null;
  const n = typeof x === "number" ? x : Number(x.toString());
  return Number.isFinite(n) ? n : null;
}

/**
 * Vitamin A activity in Retinol Activity Equivalents (µg RAE).
 *   RAE = retinol + beta_carotene / 12
 * When beta-carotene is null but total carotene is present, fall back to
 *   RAE = retinol + carotene_total / 12
 * Returns null only when all three inputs are null.
 */
export function vitaminA_RAE(
  retinol_mcg: number | null,
  beta_carotene_mcg: number | null,
  carotene_total_mcg: number | null
): number | null {
  if (retinol_mcg == null && beta_carotene_mcg == null && carotene_total_mcg == null) {
    return null;
  }
  const retinol = retinol_mcg ?? 0;
  if (beta_carotene_mcg != null) {
    return retinol + beta_carotene_mcg / 12;
  }
  if (carotene_total_mcg != null) {
    return retinol + carotene_total_mcg / 12;
  }
  return retinol;
}

/**
 * Estimated chloride from sodium: Cl ≈ Na × 1.54 (mass ratio in NaCl).
 * This is an ESTIMATE — label it as such in the UI. Null in → null out.
 */
export function chlorideEst_mg(sodium_mg: number | null): number | null {
  if (sodium_mg == null) return null;
  return sodium_mg * 1.54;
}

/**
 * Scale a per-100g value to an arbitrary serving weight in grams.
 * Null per-100g → null (unknown stays unknown, never 0).
 */
export function perServing(per100g: number | null, grams: number): number | null {
  if (per100g == null) return null;
  return (per100g * grams) / 100;
}
