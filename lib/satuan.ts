// Household measures ("satuan") — how a person actually says a portion.
//
// Nobody eats "100 g of sate"; they eat 5 tusuk. Every food therefore carries
// a noun and how many of that noun make one default portion, so the portion
// sheet can say "10 tusuk" when you double it rather than the nonsense
// "2 × 5 tusuk".
//
// Two numbers do the work:
//   portionG  — grams in one default portion (200 g of nasi putih)
//   satuanN   — how many nouns are in that portion (5, for "5 tusuk")
// A multiplier of 2 means 2 × portionG grams and 2 × satuanN nouns.

/** A parsed household measure: "5 tusuk" → { n: 5, noun: "tusuk" }. */
export type Satuan = { n: number; noun: string };

/** Used when a food has no serving information at all. */
export const DEFAULT_NOUN = "porsi";

/** Split "5 tusuk" / "1 porsi" / "6 pcs" into its count and its noun. A label
 *  with no leading number counts as one ("mangkok" → 1 mangkok). */
export function parseSatuan(label: string | null | undefined): Satuan {
  const raw = (label ?? "").trim();
  if (!raw) return { n: 1, noun: DEFAULT_NOUN };
  const m = raw.match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
  if (!m) return { n: 1, noun: raw };
  const n = parseFloat(m[1].replace(",", "."));
  const noun = m[2].trim();
  if (!Number.isFinite(n) || n <= 0) return { n: 1, noun: noun || DEFAULT_NOUN };
  return { n, noun: noun || DEFAULT_NOUN };
}

/** Trim a float for display: 2 → "2", 0.5 → "0.5", 1.25 → "1.25". */
function tidy(n: number): string {
  const r = Math.round(n * 100) / 100;
  return String(r);
}

/**
 * The measure to show for `mult` default portions.
 *
 *   resolveSatuan("5 tusuk", 2)   → "10 tusuk"
 *   resolveSatuan("1 butir", 0.5) → "0.5 butir"
 *   resolveSatuan(undefined, 3)   → "3 porsi"
 *
 * Never "2 × 5 tusuk" — the count is multiplied through, which is how someone
 * would actually say it.
 */
export function resolveSatuan(label: string | null | undefined, mult: number): string {
  const { n, noun } = parseSatuan(label);
  return `${tidy(n * mult)} ${noun}`;
}

/** The one-line descriptor under a food's name: "1 porsi · 200g". */
export function satuanLine(label: string | null | undefined, portionG: number): string {
  const { n, noun } = parseSatuan(label);
  return `${tidy(n)} ${noun} · ${Math.round(portionG)}g`;
}

/**
 * Household measures inferred from a food's NAME, for the ~1800 catalogue rows
 * that carry no serving data of their own.
 *
 * This is a heuristic, and it is deliberately a shallow one: matching on the
 * words Indonesian dishes are actually named after gets most of the library
 * from "100 g" to something a person would say, and anything it misses still
 * falls back to "1 porsi". It is NOT a claim that every row is now accurate —
 * a real serving column on the Food table would be.
 *
 * Order matters: the first pattern that matches wins, so specific dishes are
 * listed before the generic category words they contain.
 */
const SATUAN_RULES: { re: RegExp; label: string; grams: number }[] = [
  // Explicit rows from the handoff table.
  { re: /\bnasi goreng\b/, label: "1 porsi", grams: 300 },
  { re: /\bnasi\b/, label: "1 porsi", grams: 200 },
  { re: /\btelur\b/, label: "1 butir", grams: 50 },
  { re: /\bdada ayam\b/, label: "1 fillet", grams: 150 },
  { re: /\bsate\b/, label: "5 tusuk", grams: 120 },
  { re: /\b(tempe|tahu)\b/, label: "2 potong", grams: 80 },
  { re: /\bmie ayam\b/, label: "1 mangkok", grams: 250 },
  { re: /\bbakso\b/, label: "1 mangkok", grams: 200 },
  { re: /\bsoto\b/, label: "1 mangkok", grams: 400 },
  { re: /\boat|oatmeal\b/, label: "1 saset", grams: 40 },
  { re: /\bpisang\b/, label: "1 buah", grams: 120 },
  { re: /\bsushi\b/, label: "6 pcs", grams: 150 },
  { re: /\bsambal\b/, label: "1 sdm", grams: 25 },
  { re: /\bes teh\b/, label: "1 gelas", grams: 300 },
  { re: /\bkopi|kopi susu\b/, label: "1 gelas", grams: 250 },

  // Generic shapes, so the rest of the catalogue still reads like food.
  { re: /\b(bubur|sop|soup|kuah|mie|bihun|kwetiau|ramen)\b/, label: "1 mangkok", grams: 250 },
  { re: /\b(teh|jus|susu|air|minuman|kopi|latte|americano|smoothie)\b/, label: "1 gelas", grams: 250 },
  { re: /\b(ayam|ikan|daging|sapi|bebek|rendang|dendeng)\b/, label: "1 potong", grams: 120 },
  { re: /\b(apel|jeruk|mangga|pir|alpukat|buah)\b/, label: "1 buah", grams: 150 },
  { re: /\b(roti|kue|donat|biskuit)\b/, label: "1 potong", grams: 60 },
  { re: /\b(kerupuk|keripik|snack)\b/, label: "1 bungkus", grams: 40 },
  { re: /\b(sayur|tumis|capcay|gado|lalapan|brokoli|bayam|kangkung)\b/, label: "1 porsi", grams: 100 },
];

/** The weight a food's own `unit` string names: "1 bowl (300g)" → 300,
 *  "150g" → 150. Null when it doesn't name one ("1 scoop", "1 porsi"). */
export function gramsFromUnit(unit: string | null | undefined): number | null {
  const m = (unit ?? "").match(/(\d+(?:\.\d+)?)\s*g\b/i);
  if (!m) return null;
  const g = parseFloat(m[1]);
  return Number.isFinite(g) && g > 0 ? g : null;
}

/**
 * How many grams the food's STORED macros describe.
 *
 * This is the number every portion calculation divides by, and getting it
 * wrong silently multiplies calories. Three cases, in order:
 *   · `gramsPerUnit` — DB rows (100) and most library rows say so outright.
 *   · the weight named in `unit` — "1 bowl (300g)" means 300 g of bubur.
 *   · neither — one stored unit IS one portion, so the scale is 1.
 */
export function baseGrams(food: {
  gramsPerUnit?: number | null;
  unit?: string | null;
  portionG?: number | null;
}): number {
  if (food.gramsPerUnit && food.gramsPerUnit > 0) return food.gramsPerUnit;
  const fromUnit = gramsFromUnit(food.unit);
  if (fromUnit) return fromUnit;
  if (food.portionG && food.portionG > 0) return food.portionG;
  return 100;
}

/** The inferred measure for a name, or null when nothing matches. */
export function satuanFromName(name: string | null | undefined): { label: string; grams: number } | null {
  const n = (name ?? "").toLowerCase();
  if (!n) return null;
  for (const r of SATUAN_RULES) {
    if (r.re.test(n)) return { label: r.label, grams: r.grams };
  }
  return null;
}

/**
 * Pick the household measure for a food.
 *
 * Real serving data wins; then the food's own default portion; then the
 * name-based guess above; and only then "1 porsi · 100 g". Nobody eats
 * "100 g of sate", so that last fallback should be rare.
 */
export function satuanFor(food: {
  name?: string | null;
  unit?: string | null;
  portionG?: number | null;
  servings?: { label: string; grams: number }[] | null;
  gramsPerUnit?: number | null;
}): { label: string; portionG: number } {
  const servings = food.servings ?? [];

  // 1. A real serving row — the food told us itself.
  if (servings.length > 0) {
    const portionG =
      food.portionG && food.portionG > 0 ? food.portionG : servings[0].grams;
    const match = servings.find((s) => Math.abs(s.grams - portionG) < 0.5);
    return { label: match?.label ?? servings[0].label, portionG };
  }

  const guess = satuanFromName(food.name);

  // 2. A declared default portion. Keep the grams; borrow only the noun.
  if (food.portionG && food.portionG > 0) {
    return { label: guess?.label ?? `1 ${DEFAULT_NOUN}`, portionG: food.portionG };
  }

  // 3. The food's `unit` already names a weight ("1 bowl (300g)"). Trust that
  //    over the heuristic's grams — it's real data, the guess isn't — but keep
  //    the heuristic's Indonesian noun where it has one.
  const fromUnit = gramsFromUnit(food.unit);
  if (fromUnit) {
    const noun = guess ? parseSatuan(guess.label).noun : DEFAULT_NOUN;
    return { label: `1 ${noun}`, portionG: fromUnit };
  }

  // 4. Nothing declared: guess both from the name.
  if (guess) return { label: guess.label, portionG: guess.grams };

  // 5. Last resort.
  const portionG = food.gramsPerUnit && food.gramsPerUnit > 0 ? food.gramsPerUnit : 100;
  return { label: `1 ${DEFAULT_NOUN}`, portionG };
}

/** The eight portion stops on the sheet's slider. */
export const PORTION_STEPS: { label: string; mult: number }[] = [
  { label: "¼", mult: 0.25 },
  { label: "½", mult: 0.5 },
  { label: "¾", mult: 0.75 },
  { label: "1", mult: 1 },
  { label: "1¼", mult: 1.25 },
  { label: "1½", mult: 1.5 },
  { label: "2", mult: 2 },
  { label: "3", mult: 3 },
];

/** Index of the stop closest to `grams`, so a typed weight still lights up the
 *  slider at the nearest notch instead of leaving it stranded. */
export function nearestStep(grams: number, portionG: number): number {
  if (!(portionG > 0)) return 3; // the "1" stop
  let best = 0;
  let bestD = Infinity;
  PORTION_STEPS.forEach((st, i) => {
    const d = Math.abs(grams - portionG * st.mult);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}
