// Boba / milk-tea style drinks whose sweetness you choose at the counter
// (100 / 70 / 50 / 30 / 0%). The value is grams of sugar per 100 ml at 100%
// sweetness — the catalogue macros for these drinks are stored at 100%, and the
// builder's sugar-level selector removes sugar from there (4 kcal + 1 carb gram
// per gram of sugar removed). Keyed by the food's sourceCode (DRINK:<code>).
//
// Only drinks listed here show the selector; everything else is a fixed item.

export const DRINK_SUGAR_FULL: Record<string, number> = {
  "DRINK:tz-almond-boba-jelly": 10.4,
  "DRINK:tz-brown-sugar-boba": 11.0,
};

/** Grams of sugar per 100 (ml) at full sweetness, or null if the drink has no
 *  adjustable sweetness. */
export function drinkSugarFull(sourceCode: string): number | null {
  return DRINK_SUGAR_FULL[sourceCode] ?? null;
}

/** Selectable sweetness levels, high → low. */
export const SUGAR_LEVELS = [100, 70, 50, 30, 0] as const;
