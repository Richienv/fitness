// In-memory food search engine — the "TikTok-grade" upgrade over raw ILIKE.
// See docs/enhanced-search-prompt.md for the full specification.
//
// Pure TypeScript, no DB and no pg extensions, so it is unit-testable and runs
// anywhere. The API route loads the catalogue once per instance, builds a
// FoodSearchIndex, and answers every keystroke from RAM.
//
// What it adds over the previous SQL scoring:
//   • Typo tolerance   — words absent from the catalogue vocabulary are
//                        corrected via bounded Damerau–Levenshtein distance
//                        ("dagin" → "daging", "cincag" → "cincang").
//   • Bilingual tokens — an EN↔ID synonym dictionary expands each query word
//                        both ways ("beef minced" → sapi/daging + cincang).
//   • Order-free words — every query word scores independently, so
//                        "minced beef" ≡ "beef minced".
// The tier weights deliberately mirror the old SQL scoreExpr (exact 1000 /
// en 900 / prefix 500…), so ranking for clean queries is unchanged.

import { expandAliases } from "./foodAliases.ts";

export interface FoodDoc {
  id: string;
  sourceCode: string;
  name: string;
  nameEn: string | null;
  state: string | null;
  foodGroup: string | null;
  energy_kcal: number | null;
  protein_g: number | null;
  fat_g: number | null;
  carb_g: number | null;
  /** Persisted recall bag from seed time (may be ""). */
  searchText: string;
  popularity: number;
}

export interface ScoredFood extends FoodDoc {
  score: number;
}

/** lowercase + strip diacritics — must match normalizeName used at seed time. */
export function normalizeQuery(q: string): string {
  return q
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

/** Split a normalized string into indexable words. */
export function tokenize(s: string): string[] {
  return s.split(/[^a-z0-9]+/).filter((w) => w.length >= 2);
}

// ─── Bilingual token synonyms ────────────────────────────────────────────────
// Each group is a set of interchangeable food words across EN/ID (plus common
// informal spellings). A query token expands to its whole group, so either
// language — or a mix — finds the row. Keep entries normalized (lowercase,
// no diacritics).
const SYNONYM_GROUPS: string[][] = [
  ["beef", "sapi"],
  ["meat", "daging"],
  ["minced", "mince", "ground", "cincang", "giling"],
  ["chicken", "ayam"],
  ["egg", "eggs", "telur", "telor"],
  ["fish", "ikan"],
  ["shrimp", "prawn", "udang"],
  ["squid", "cumi"],
  ["crab", "kepiting"],
  ["pork", "babi"],
  ["goat", "mutton", "lamb", "kambing"],
  ["duck", "bebek"],
  ["liver", "hati"],
  ["rice", "nasi", "beras"],
  ["fried", "goreng"],
  ["grilled", "roasted", "bakar", "panggang"],
  ["boiled", "rebus"],
  ["steamed", "kukus"],
  ["raw", "mentah"],
  ["noodle", "noodles", "mie", "mi", "bakmi"],
  ["bread", "toast", "roti"],
  ["milk", "susu"],
  ["cheese", "keju"],
  ["tofu", "tahu"],
  ["tempeh", "tempe"],
  ["potato", "kentang"],
  ["corn", "jagung"],
  ["cassava", "singkong"],
  ["peanut", "nut", "nuts", "kacang"],
  ["vegetable", "vegetables", "sayur", "sayuran"],
  ["spinach", "bayam"],
  ["kangkung", "kangkong"],
  ["carrot", "wortel"],
  ["cucumber", "timun", "mentimun"],
  ["tomato", "tomat"],
  ["chili", "chilli", "cabe", "cabai", "sambal"],
  ["onion", "bawang"],
  ["banana", "pisang"],
  ["apple", "apel"],
  ["orange", "jeruk"],
  ["avocado", "alpukat"],
  ["mango", "mangga"],
  ["papaya", "pepaya"],
  ["watermelon", "semangka"],
  ["coconut", "kelapa"],
  ["sugar", "gula"],
  ["sweet", "manis"],
  ["salt", "garam"],
  ["oil", "minyak"],
  ["butter", "mentega"],
  ["coffee", "kopi"],
  ["tea", "teh"],
  ["water", "air"],
  ["juice", "jus"],
  ["soup", "sup", "soto", "sop"],
  ["meatball", "bakso", "baso"],
  ["satay", "sate", "satai"],
  ["porridge", "bubur"],
  ["cake", "kue", "bolu"],
  ["snack", "cemilan", "camilan"],
  ["breast", "dada"],
  ["thigh", "paha"],
  ["wing", "wings", "sayap"],
];

const TOKEN_SYNONYMS: Map<string, string[]> = (() => {
  const m = new Map<string, string[]>();
  for (const group of SYNONYM_GROUPS) {
    for (const word of group) {
      const others = group.filter((w) => w !== word);
      const prev = m.get(word);
      m.set(word, prev ? [...new Set([...prev, ...others])] : others);
    }
  }
  return m;
})();

/** Synonyms for a single normalized token (empty when none). Exported for tests. */
export function tokenSynonyms(token: string): string[] {
  return TOKEN_SYNONYMS.get(token) ?? [];
}

// ─── Typo correction ─────────────────────────────────────────────────────────

/**
 * Bounded Damerau–Levenshtein (optimal string alignment) distance. Returns
 * `max + 1` as soon as the distance provably exceeds `max`, so mismatches are
 * cheap to reject.
 */
export function boundedEditDistance(a: string, b: string, max: number): number {
  if (a === b) return 0;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > max) return max + 1;

  let prev2: number[] = [];
  let prev: number[] = Array.from({ length: lb + 1 }, (_, j) => j);
  for (let i = 1; i <= la; i++) {
    const cur: number[] = [i];
    let rowMin = i;
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(
        prev[j] + 1, // deletion
        cur[j - 1] + 1, // insertion
        prev[j - 1] + cost // substitution
      );
      // Transposition counts as one edit ("dagnig" → "daging").
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, prev2[j - 2] + 1);
      }
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[lb] <= max ? prev[lb] : max + 1;
}

/** Allowed edits for a word of this length (short words stay strict). */
function maxEditsFor(len: number): number {
  if (len >= 8) return 2;
  if (len >= 4) return 1;
  return 0;
}

// ─── Scoring weights ─────────────────────────────────────────────────────────
// Per-token tiers (best single tier wins per token, per expansion candidate).
const W_NAME_WORD = 250;
const W_EN_WORD = 230;
const W_NAME_PREFIX = 160;
const W_EN_PREFIX = 150;
const W_NAME_SUB = 90;
const W_EN_SUB = 80;
const W_TEXT_WORD = 60;
const W_TEXT_PREFIX = 40;
const W_TEXT_SUB = 25;
// Candidate-origin multipliers: precise typing still wins ties.
const M_EXACT = 1;
const M_SYNONYM = 0.9;
const M_FUZZY = 0.75;
const M_FUZZY_SYNONYM = 0.65;
// Phrase-level tiers (mirror the old SQL scoreExpr).
const P_NAME_EXACT = 1000;
const P_EN_EXACT = 900;
const P_NAME_PREFIX = 500;
const P_EN_PREFIX = 450;
const P_NAME_PHRASE = 250;
const P_EN_PHRASE = 230;
const P_NAME_SUB = 120;
const P_EN_SUB = 110;
const P_TEXT_SUB = 60;
const B_ALL_TOKENS = 100;
const B_OLAHAN = 30;
const POPULARITY_CAP = 200;
const LEN_PENALTY = 0.4;

interface IndexedDoc {
  doc: FoodDoc;
  nameNorm: string;
  enNorm: string;
  textNorm: string;
  nameWords: string[];
  enWords: string[];
  textWords: string[];
  base: number; // query-independent: olahan + popularity − length penalty
}

interface Candidate {
  term: string;
  mult: number;
}

export interface SearchOptions {
  /** Restrict to these foodGroup values (browse filter). */
  groups?: string[];
  limit?: number;
}

export class FoodSearchIndex {
  private items: IndexedDoc[] = [];
  /** word → number of docs containing it (fuzzy-correction vocabulary). */
  private vocab = new Map<string, number>();

  constructor(docs: FoodDoc[]) {
    for (const doc of docs) {
      const nameNorm = normalizeQuery(doc.name);
      const enNorm = normalizeQuery(doc.nameEn ?? "");
      const textNorm = normalizeQuery(doc.searchText);
      const nameWords = tokenize(nameNorm);
      const enWords = tokenize(enNorm);
      const textWords = tokenize(textNorm);
      const base =
        ((doc.state ?? "").toLowerCase() === "olahan" ? B_OLAHAN : 0) +
        Math.min(doc.popularity ?? 0, POPULARITY_CAP) -
        doc.name.length * LEN_PENALTY;
      this.items.push({
        doc,
        nameNorm,
        enNorm,
        textNorm,
        nameWords,
        enWords,
        textWords,
        base,
      });
      const seen = new Set([...nameWords, ...enWords, ...textWords]);
      for (const w of seen) this.vocab.set(w, (this.vocab.get(w) ?? 0) + 1);
    }
  }

  get size(): number {
    return this.items.length;
  }

  /**
   * Correct a token against the catalogue vocabulary. Only runs when the word
   * itself is unknown; returns the closest few corrections (distance first,
   * then document frequency).
   */
  fuzzyExpand(token: string): string[] {
    if (this.vocab.has(token)) return [];
    const max = maxEditsFor(token.length);
    if (max === 0) return [];
    const hits: { word: string; dist: number; freq: number }[] = [];
    for (const [word, freq] of this.vocab) {
      const d = boundedEditDistance(token, word, max);
      if (d <= max) hits.push({ word, dist: d, freq });
    }
    hits.sort((x, y) => x.dist - y.dist || y.freq - x.freq);
    return hits.slice(0, 4).map((h) => h.word);
  }

  /** Browse mode: no query, rank a group slice purely by the static prior. */
  browse(groups: string[], limit: number): ScoredFood[] {
    const set = new Set(groups);
    return this.items
      .filter((it) => it.doc.foodGroup != null && set.has(it.doc.foodGroup))
      .map((it) => ({ ...it.doc, score: Math.round(it.base) }))
      .sort(
        (a, b) =>
          b.score - a.score ||
          a.name.length - b.name.length ||
          a.name.localeCompare(b.name)
      )
      .slice(0, limit);
  }

  search(rawQuery: string, opts: SearchOptions = {}): ScoredFood[] {
    const limit = opts.limit ?? 30;
    const q = normalizeQuery(rawQuery);
    if (!q) {
      return opts.groups ? this.browse(opts.groups, limit) : [];
    }

    // Phrase-level terms: the query plus dish-name aliases (nasgor → nasi goreng).
    const phraseTerms = expandAliases(q);

    // Token-level candidates: typed word + synonyms + typo corrections
    // (+ synonyms of corrections, so "beff" → beef → sapi still works).
    const tokens = tokenize(q);
    const tokenCandidates: Candidate[][] = tokens.map((t) => {
      const cands: Candidate[] = [{ term: t, mult: M_EXACT }];
      const have = new Set([t]);
      for (const s of tokenSynonyms(t)) {
        if (!have.has(s)) {
          have.add(s);
          cands.push({ term: s, mult: M_SYNONYM });
        }
      }
      for (const f of this.fuzzyExpand(t)) {
        if (!have.has(f)) {
          have.add(f);
          cands.push({ term: f, mult: M_FUZZY });
        }
        for (const s of tokenSynonyms(f)) {
          if (!have.has(s)) {
            have.add(s);
            cands.push({ term: s, mult: M_FUZZY_SYNONYM });
          }
        }
      }
      return cands;
    });

    const groupSet = opts.groups ? new Set(opts.groups) : null;
    const strict: ScoredFood[] = [];
    const relaxed: ScoredFood[] = [];

    for (const it of this.items) {
      if (groupSet && (it.doc.foodGroup == null || !groupSet.has(it.doc.foodGroup))) {
        continue;
      }

      // Phrase tiers — best alias term per tier (GREATEST semantics).
      let phrase = 0;
      let phraseSub = false;
      for (const term of phraseTerms) {
        let s = 0;
        if (it.nameNorm === term) s = Math.max(s, P_NAME_EXACT);
        if (it.enNorm === term) s = Math.max(s, P_EN_EXACT);
        if (it.nameNorm.startsWith(term)) s = Math.max(s, P_NAME_PREFIX);
        if (it.enNorm && it.enNorm.startsWith(term)) s = Math.max(s, P_EN_PREFIX);
        if (` ${it.nameNorm} `.includes(` ${term} `)) s = Math.max(s, P_NAME_PHRASE);
        if (it.enNorm && ` ${it.enNorm} `.includes(` ${term} `)) s = Math.max(s, P_EN_PHRASE);
        if (it.nameNorm.includes(term)) {
          s = Math.max(s, P_NAME_SUB);
          phraseSub = true;
        }
        if (it.enNorm && it.enNorm.includes(term)) {
          s = Math.max(s, P_EN_SUB);
          phraseSub = true;
        }
        if (it.textNorm.includes(term)) s = Math.max(s, P_TEXT_SUB);
        phrase = Math.max(phrase, s);
      }

      // Per-token tiers — order-independent; each token takes its best
      // candidate × origin multiplier.
      let tokenScore = 0;
      let matched = 0;
      for (const cands of tokenCandidates) {
        let best = 0;
        for (const { term, mult } of cands) {
          const s = scoreToken(it, term) * mult;
          if (s > best) best = s;
        }
        if (best > 0) matched++;
        tokenScore += best;
      }

      const allMatched = tokens.length > 0 && matched === tokens.length;
      if (matched === 0 && !phraseSub) continue;

      const score = Math.round(
        phrase + tokenScore + (allMatched ? B_ALL_TOKENS : 0) + it.base
      );
      const row: ScoredFood = { ...it.doc, score };
      if (allMatched || phraseSub) strict.push(row);
      else relaxed.push(row);
    }

    // Strict pass first (every word accounted for); if it found nothing, fall
    // back to partial matches so the user never sees an empty list.
    const pool = strict.length ? strict : relaxed;
    return pool
      .sort(
        (a, b) =>
          b.score - a.score ||
          a.name.length - b.name.length ||
          a.name.localeCompare(b.name)
      )
      .slice(0, limit);
  }
}

/** Best single-field tier for one candidate term against one doc. */
function scoreToken(it: IndexedDoc, term: string): number {
  let s = 0;
  if (it.nameWords.includes(term)) return W_NAME_WORD;
  if (it.enWords.includes(term)) s = Math.max(s, W_EN_WORD);
  if (s < W_NAME_PREFIX && it.nameWords.some((w) => w.startsWith(term)))
    s = Math.max(s, W_NAME_PREFIX);
  if (s < W_EN_PREFIX && it.enWords.some((w) => w.startsWith(term)))
    s = Math.max(s, W_EN_PREFIX);
  if (s < W_NAME_SUB && it.nameNorm.includes(term)) s = Math.max(s, W_NAME_SUB);
  if (s < W_EN_SUB && it.enNorm.includes(term)) s = Math.max(s, W_EN_SUB);
  if (s < W_TEXT_WORD && it.textWords.includes(term)) s = Math.max(s, W_TEXT_WORD);
  if (s < W_TEXT_PREFIX && it.textWords.some((w) => w.startsWith(term)))
    s = Math.max(s, W_TEXT_PREFIX);
  if (s < W_TEXT_SUB && it.textNorm.includes(term)) s = Math.max(s, W_TEXT_SUB);
  return s;
}
