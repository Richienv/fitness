// Client-side food search.
//
// Once the catalogue is in memory there is no reason to ask a server what
// "ayam" matches. Ranking here makes every keystroke instant, works with no
// signal, and — more importantly — lets the matching rules be read and tested
// rather than buried in a SQL score expression.
//
// The three decisions that matter:
//
//  1. AND across query tokens. "ayam bakar" must match foods containing BOTH,
//     not either. OR semantics is why searching two words used to return more
//     results than one, which is the opposite of what typing more should do.
//  2. Score by HOW a token matched, not just that it did. A whole-word hit
//     beats a substring buried mid-name, so "ayam" ranks "Ayam bakar" above
//     "Bayam" — the latter only contains the letters.
//  3. Shorter names win ties. "Ayam goreng" is a better answer to "ayam" than
//     "Ayam goreng tepung saus padang", because the extra words are things the
//     user did not ask for.

import { buildIndex, termScore, type Bm25Field, type Bm25Index } from "./bm25.ts";
import { collapseReduplication, indonesianAliases } from "./indonesian.ts";

export type SearchableFood = {
  id: string;
  name: string;
  englishName?: string;
  foodGroup?: string;
  cuisine?: string;
  /** Static prior from the seed — staples should edge out obscure entries. */
  popularity?: number;
};

/** lowercase, strip diacritics, collapse punctuation to spaces. Must agree
 *  with the seed-time normalizer so client and server rank the same text. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function tokenize(s: string): string[] {
  const n = normalize(s);
  if (!n) return [];
  // "gado-gado" normalises to two identical tokens. Left alone, the AND rule
  // asks the same question twice and BM25 counts the same evidence twice; and
  // someone typing the singular "cumi" would not reach "Cumi-Cumi". Indonesian
  // does not otherwise repeat a word immediately, so collapsing an adjacent
  // duplicate is safe.
  return collapseReduplication(n.split(" ").filter(Boolean));
}

/** Damerau-Levenshtein distance, bailing out once it exceeds `max`.
 *  Bounded so a long name can't cost more than a few dozen operations. */
export function editDistance(a: string, b: string, max = 2): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const n = b.length;
  // THREE rows, not two. A transposition costs d[i-2][j-2] + 1, so the row
  // two back has to still be around — reading d[i-1][j-2] instead scores
  // "gorneg" against "goreng" as 2 edits, and a 6-letter word only forgives 1.
  let prevPrev = new Array<number>(n + 1).fill(0);
  let prev = new Array<number>(n + 1);
  let cur = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    let best = cur[0];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, prevPrev[j - 2] + 1);
      }
      cur[j] = v;
      if (v < best) best = v;
    }
    if (best > max) return max + 1; // every later row can only be larger
    const spare = prevPrev;
    prevPrev = prev;
    prev = cur;
    cur = spare;
  }
  return prev[n];
}

/** How many typos to forgive, by token length. One-letter slips shouldn't
 *  turn "es" into "nasi". */
function typoBudget(token: string): number {
  if (token.length <= 3) return 0;
  if (token.length <= 6) return 1;
  return 2;
}

// How well one query token matched one field, highest wins.
const HIT = {
  EXACT: 100, // the field IS the token
  PREFIX_FIELD: 80, // field starts with it — "ayam …"
  WORD_EXACT: 70, // a whole word equals it
  WORD_PREFIX: 50, // a word starts with it — "gor" → "goreng"
  SUBSTRING: 22, // appears somewhere — "yam" inside "bayam"
  FUZZY: 16, // within the typo budget of some word
  NONE: 0,
} as const;

/** Best match of one token against one field. */
export function scoreToken(token: string, field: string): number {
  if (!field) return HIT.NONE;
  if (field === token) return HIT.EXACT;
  if (field.startsWith(token + " ")) return HIT.PREFIX_FIELD;

  const words = field.split(" ");
  let best: number = HIT.NONE;
  for (const w of words) {
    if (w === token) return HIT.WORD_EXACT;
    if (w.startsWith(token)) best = Math.max(best, HIT.WORD_PREFIX);
  }
  if (best > HIT.NONE) return best;

  if (field.includes(token)) return HIT.SUBSTRING;

  const budget = typoBudget(token);
  if (budget > 0) {
    for (const w of words) {
      if (editDistance(token, w, budget) <= budget) return HIT.FUZZY;
    }
  }
  return HIT.NONE;
}

/** Field weights. A hit on the Indonesian name counts for more than the same
 *  hit on a food-group label, which is often generic ("Masakan Nusantara"). */
const FIELD_WEIGHT = { name: 1, english: 0.75, group: 0.35, cuisine: 0.35 } as const;

/**
 * How much of a term occurrence a match is WORTH, by how it matched.
 *
 * This is the bridge between the tiered matcher above and BM25 below. The old
 * ranker used the tier as the score itself; now the tier only decides how much
 * evidence the match provides, and BM25 decides what that evidence is worth
 * given how rare the word is across the catalogue. A fuzzy hit on "betutu"
 * (one food) should still beat an exact hit on "ayam" (hundreds), and no hand
 * -tuned table gets that right on its own.
 */
// NOTE the branch order: the tiers are 100 / 80 / 70 / 50 / 22 / 16, so these
// MUST be tested from the top down. Written as EXACT, WORD_EXACT, PREFIX_FIELD
// this silently collapses two tiers — 80 satisfies `>= 70` first, so a name
// that STARTS with the query scores the same as one that merely contains it as
// a word, and "Mie ayam" ties with "Ayam Geprek" for the query "ayam". Length
// normalisation then breaks the tie toward the shorter name, and the wrong
// food wins.
function tierToTf(tier: number): number {
  if (tier >= HIT.EXACT) return 1;
  if (tier >= HIT.PREFIX_FIELD) return 0.92;
  if (tier >= HIT.WORD_EXACT) return 0.8;
  if (tier >= HIT.WORD_PREFIX) return 0.6;
  if (tier >= HIT.SUBSTRING) return 0.4;
  if (tier >= HIT.FUZZY) return 0.28;
  return 0;
}

export type Scored<T> = { food: T; score: number };

type Doc<T> = {
  food: T;
  name: string;
  english: string;
  group: string;
  cuisine: string;
  popularity: number;
  nameLen: number;
};

/** Opaque to callers: the normalized docs plus the BM25 statistics over them. */
export type Prepared<T> = {
  docs: Doc<T>[];
  index: Bm25Index;
};

const FIELDS: Bm25Field[] = [
  { name: "name", weight: FIELD_WEIGHT.name },
  { name: "english", weight: FIELD_WEIGHT.english },
  { name: "group", weight: FIELD_WEIGHT.group },
  { name: "cuisine", weight: FIELD_WEIGHT.cuisine },
];

/** Pre-normalize the catalogue and build the BM25 index once. Doing this per
 *  keystroke over ~1800 rows is what makes naive client search feel slow;
 *  doing it once makes it free. */
export function prepare<T extends SearchableFood>(foods: readonly T[]): Prepared<T> {
  const docs: Doc<T>[] = foods.map((f) => {
    const name = normalize(f.name);
    return {
      food: f,
      name,
      english: f.englishName ? normalize(f.englishName) : "",
      group: f.foodGroup ? normalize(f.foodGroup) : "",
      cuisine: f.cuisine ? normalize(f.cuisine) : "",
      popularity: f.popularity ?? 0,
      nameLen: name.length,
    };
  });
  const index = buildIndex(
    docs.map((d) => ({
      fields: {
        name: d.name ? d.name.split(" ") : [],
        english: d.english ? d.english.split(" ") : [],
        group: d.group ? d.group.split(" ") : [],
        cuisine: d.cuisine ? d.cuisine.split(" ") : [],
      },
    })),
    FIELDS
  );
  return { docs, index };
}

export type SearchOptions = {
  limit?: number;
  /** Expand each token into synonyms (English↔Indonesian). Any one matching
   *  satisfies that token. */
  aliases?: (token: string) => string[];
};

/**
 * Rank a prepared catalogue against a query, scoring with Okapi BM25.
 *
 * EVERY query token must hit something, or the food is dropped. This is the
 * difference between "ayam bakar" meaning "grilled chicken" and it meaning
 * "anything chicken, plus anything grilled". BM25 does not change that
 * decision — it is a ranking function, not a matching one, and OR semantics
 * here would put "Bakar" dishes with no chicken above chicken dishes purely on
 * term rarity. AND first, then rank what survives.
 */
export function searchPrepared<T extends SearchableFood>(
  prepared: Prepared<T>,
  query: string,
  opts: SearchOptions = {}
): Scored<T>[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];
  const limit = opts.limit ?? 60;
  const { docs, index } = prepared;

  const out: Scored<T>[] = [];
  for (let i = 0; i < docs.length; i++) {
    const p = docs[i];
    let total = 0;
    let ok = true;

    for (const token of tokens) {
      // Aliases default to the Indonesian layer: spelling variants, English
      // synonyms, and affix-stripped forms. A caller can still override.
      const expand = opts.aliases ?? indonesianAliases;
      const variants = [token, ...expand(token)];
      let best = 0;
      for (const v of variants) {
        // An alias match is real but weaker than the word the user typed.
        const penalty = v === token ? 1 : 0.8;
        for (const [field, weight] of [
          ["name", FIELD_WEIGHT.name],
          ["english", FIELD_WEIGHT.english],
          ["group", FIELD_WEIGHT.group],
          ["cuisine", FIELD_WEIGHT.cuisine],
        ] as const) {
          const text = p[field];
          if (!text) continue;
          const tf = tierToTf(scoreToken(v, text)) * weight * penalty;
          if (tf <= 0) continue;
          // IDF comes from the term the user actually typed when the corpus
          // knows it; for a prefix or typo the token is absent from the
          // vocabulary, and idf() then returns the maximum — which is right,
          // because an unknown word is maximally selective.
          const s = termScore(index, v, i, tf);
          if (s > best) best = s;
        }
      }
      if (best <= 0) {
        ok = false;
        break;
      }
      total += best;
    }
    if (!ok) continue;

    // Whole-query bonus: the tokens appearing together, in order, beats them
    // being scattered ("nasi goreng" over "nasi + telur goreng"). Expressed
    // relative to the BM25 total so it stays a nudge as the corpus grows.
    const phrase = tokens.join(" ");
    if (tokens.length > 1 && p.name.includes(phrase)) total += 0.6 * total + 1;

    // Popularity is a tiebreaker, never a driver.
    total += Math.min(p.popularity, 200) * 0.0015;

    // Prefer the shorter name among equals: fewer unasked-for words.
    total -= Math.min(p.nameLen, 60) * 0.004;

    out.push({ food: p.food, score: total });
  }

  out.sort((a, b) => b.score - a.score || a.food.name.localeCompare(b.food.name, "id"));
  return out.slice(0, limit);
}

/** Convenience: prepare + search in one call. Prefer holding onto the prepared
 *  list when searching repeatedly. */
export function searchFoods<T extends SearchableFood>(
  foods: readonly T[],
  query: string,
  opts: SearchOptions = {}
): T[] {
  return searchPrepared(prepare(foods), query, opts).map((s) => s.food);
}
