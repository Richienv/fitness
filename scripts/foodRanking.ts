// Search-ranking helpers for the food catalogue. Pure functions (no DB) so the
// seed can precompute a persisted search index and the test can exercise them.
//
// Two derived, persisted columns are produced here at seed time:
//   • searchText  — a normalized recall bag (name + English name + serving desc
//                   + food group), so a query can match on more than the
//                   Indonesian name alone ("toast", "sponge cake", "kaya").
//   • popularity  — a static rank (0..~) so staples and high-confidence entries
//                   float to the top and rough estimates sink. It is a coarse
//                   prior, not usage data — the query-time score does the rest.

import { normalizeName, type FoodRow } from "./foodCsv.ts";

/** Common everyday foods Indonesians log most — matched as substrings of the
 *  normalized name. A hit is a strong popularity signal. */
const STAPLES = [
  "nasi",
  "ayam",
  "telur",
  "tempe",
  "tahu",
  "ikan",
  "daging",
  "sapi",
  "mie",
  "bakmi",
  "roti",
  "susu",
  "pisang",
  "kopi",
  "teh",
  "gado",
  "bakso",
  "sate",
  "rendang",
  "soto",
  "udang",
  "kentang",
  "jagung",
  "kacang",
  "apel",
  "jeruk",
  "alpukat",
  "sayur",
];

/** Offal / obscure cuts most people never log — matched as whole words in the
 *  normalized name so they sink below common cuts (e.g. a "sapi" search shows
 *  muscle meat before "sapi, paru"). Down-ranked, not removed. "abon" (floss)
 *  and "hati" (liver) are intentionally left off — they're commonly eaten. */
const OFFAL = [
  "paru",
  "babat",
  "usus",
  "jeroan",
  "limpa",
  "otak",
  "ginjal",
  "torpedo",
  "kikil",
  "tetelan",
  "lidah",
  "ampela",
  "sumsum",
  "iso",
  "gajih",
  "kelenjar",
];

/** Food groups people browse/log often get a small nudge. */
const GROUP_BOOST: Record<string, number> = {
  Daging: 6,
  "Ikan dsb": 6,
  Telur: 6,
  Sayur: 5,
  Serealia: 5,
  Buah: 5,
  Minuman: 4,
  "Masakan Nusantara": 6,
  "Kue/Dessert": 3,
};

/**
 * The useful, human-readable head of a note — the part before our machine
 * suffixes ("· conf:...", "· per100:..."). For R2FIT rows this is the English
 * name + serving description; for others it's the whole note.
 */
function noteHead(note: string | null): string {
  if (!note) return "";
  return note.split(/·\s*(?:conf|per100)/i)[0] ?? note;
}

/**
 * The English name of a dish, when the note carries one. Our structured notes
 * (R2FIT library, drinks, café foods) are "<English name> · <serving> · conf:…";
 * the English name is the first "·"-segment. Only such structured notes (they
 * contain "conf:") are trusted — TKPI/dessert notes have no English name.
 * Returns null when there's no distinct English name.
 */
export function extractNameEn(row: FoodRow): string | null {
  const note = row.note ?? "";
  if (!/·\s*conf:/i.test(note)) return null;
  const first = (note.split("·")[0] ?? "").trim();
  if (!first) return null;
  // Don't echo the Indonesian name back.
  if (normalizeName(first) === row.nameNormalized) return null;
  return first;
}

/**
 * Build the persisted `searchText` recall bag for a row: normalized, punctuation
 * flattened to spaces, deduped-ish whitespace. Safe for ILIKE '%term%' matching.
 */
export function buildSearchText(row: FoodRow): string {
  const parts = [row.name, noteHead(row.note), row.foodGroup ?? ""];
  return normalizeName(parts.filter(Boolean).join(" "))
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Compute a static popularity prior for a row. Higher = surfaced earlier.
 * Combines: prepared-dish bump, source trust, R2FIT confidence, staple-name
 * hit, and a small food-group nudge. Never negative.
 */
export function computePopularity(row: FoodRow, source: string): number {
  let p = 0;

  if ((row.state ?? "").toLowerCase() === "olahan") p += 20;

  if (source === "TKPI") p += 10;
  else if (source === "CUSTOM") p += 8;
  else p += 5;

  const note = (row.note ?? "").toLowerCase();
  if (note.includes("conf:high")) p += 15;
  else if (note.includes("conf:med")) p += 5;
  else if (note.includes("conf:low")) p -= 10;

  const n = row.nameNormalized;
  if (STAPLES.some((s) => n.includes(s))) p += 40;

  if (row.foodGroup && GROUP_BOOST[row.foodGroup]) p += GROUP_BOOST[row.foodGroup];

  // Sink offal / obscure cuts so everyday foods surface first.
  const words = n.split(/[^a-z0-9]+/);
  if (OFFAL.some((o) => words.includes(o))) p -= 50;

  return Math.max(0, p);
}
