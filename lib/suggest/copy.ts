// Reason codes → Bahasa. The engine says WHAT it found; this says how to
// phrase it, so the copy can be rewritten without touching any logic and the
// engine's tests never assert on prose.
//
// Voice: `kamu`, no exclamation marks, no nagging.

import type { ReasonCode, ReasonParams } from "./types.ts";

const CATEGORY_ID: Record<string, string> = {
  protein: "protein",
  carb: "karbo",
  vegetable: "sayur",
  extra: "pelengkap",
  drink: "minuman",
};

/** One short line explaining why this surfaced. `name` is the food it's
 *  paired with, already resolved to something readable by the caller. */
export function reasonText(
  reason: ReasonCode,
  params: ReasonParams | undefined,
  nameOf: (foodId: string) => string
): string {
  const p = params ?? {};
  switch (reason) {
    case "CO_OCCURRENCE":
      return `biasanya kamu makan ini sama ${nameOf(String(p.withFood ?? ""))}`;
    case "PROTEIN_GAP":
      return `protein kamu masih kurang ${Math.round(Number(p.gapG) || 0)}g hari ini`;
    case "MISSING_CATEGORY":
      return `belum ada ${CATEGORY_ID[String(p.category)] ?? "ini"} di piring ini`;
    case "MEAL_ROUTINE":
      return `hampir tiap kali kamu makan ini`;
    case "PAIRED_CONDIMENT":
      return `kamu sering nambah ini ke ${nameOf(String(p.withFood ?? ""))}`;
    case "KCAL_HEADROOM":
      return `masih ada sisa ${Math.round(Number(p.headroomKcal) || 0)} kkal`;
    case "RECENT_STREAK":
      return `belakangan ini kamu makan ini terus`;
    default:
      return "";
  }
}
