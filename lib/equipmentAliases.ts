// Query expansion for the equipment/machine search — the workout-side twin of
// lib/foodAliases. Turns a typed query into extra terms so Indonesian body-part
// words, machine synonyms and common typos all find the right machine (today
// "paha dalam" / "dada" / "chst" return nothing). Pure, testable, no DB.
//
// All entries are already normalized (lowercase, tones stripped). The equipment
// catalogue is ~50 static rows, so this runs in-memory client-side.

// Whole-query phrase aliases (multi-word) — the "paha dalam" fix. When the
// normalized query equals a key, its canonical forms are added as terms.
export const EQUIP_PHRASE_ALIASES: Record<string, string[]> = {
  "paha dalam": ["inner thigh", "adductor"],
  "paha luar": ["outer thigh", "abductor", "glutes"],
  "paha belakang": ["hamstrings", "leg curl"],
  "paha depan": ["quads", "leg extension"],
  "dada atas": ["upper chest"],
  "punggung bawah": ["lower back"],
  "otot lengan": ["biceps", "triceps"],
};

// Per-word EN↔ID + machine synonyms. Typing any member surfaces rows described
// with any other member. Kept single-token where possible for per-word matching.
const SYNONYM_GROUPS: string[][] = [
  // body parts
  ["chest", "dada", "pecs", "pec"],
  ["back", "punggung", "lats", "lat"],
  ["shoulder", "bahu", "delt", "delts", "deltoid"],
  ["thigh", "paha", "quad", "quads"],
  ["glute", "glutes", "bokong", "pantat", "butt"],
  ["hamstring", "hamstrings"],
  ["calf", "calves", "betis"], // betis = calf — kept SEPARATE from hamstring
  ["arm", "lengan", "biceps", "bicep", "triceps", "tricep"],
  ["bicep", "biceps", "bisep"],
  ["tricep", "triceps", "trisep", "pushdown"],
  ["abs", "perut", "core", "crunch"],
  ["inner", "adductor", "adductors"],
  ["outer", "abductor", "abductors"],
  // machine / movement words
  ["fly", "flye", "butterfly", "deck"],
  ["row", "rowing"],
  ["pulldown", "pull", "down"],
  ["press", "tekan"],
  ["curl"],
  ["extension", "ekstensi"],
  ["raise", "lateral"],
  ["dip", "dips"],
  ["kickback"],
  ["squat", "jongkok"],
  ["cardio", "kardio", "treadmill", "lari", "sepeda", "bike", "cycling"],
];

// Precise fast-path for the most common misspellings (fuzzy is intentionally
// omitted over 50 rows — see the plan).
const TYPO_FIX: Record<string, string> = {
  chst: "chest",
  ddaa: "dada",
  sholder: "shoulder",
  shodler: "shoulder",
  soulder: "shoulder",
  tricep: "triceps",
  bicep: "biceps",
  pushdow: "pushdown",
  pushdwn: "pushdown",
  adducter: "adductor",
  abducter: "abductor",
  pilldown: "pulldown",
  puldown: "pulldown",
  betsi: "betis",
  hamstrings: "hamstring",
  legcurl: "leg curl",
  benchpress: "bench press",
};

const MAX_TERMS = 24;
const MAX_WORDS = 6;

// word → interchangeable words (incl. itself), also indexed by first token of a
// multi-word member so a single query word can reach compounds.
const WORD_SYNONYMS: Map<string, string[]> = (() => {
  const m = new Map<string, Set<string>>();
  const add = (key: string, values: string[]) => {
    let set = m.get(key);
    if (!set) {
      set = new Set<string>();
      m.set(key, set);
    }
    for (const v of values) set.add(v);
  };
  for (const group of SYNONYM_GROUPS) {
    for (const word of group) {
      add(word, group);
      const first = word.split(" ")[0];
      if (first !== word) add(first, group);
    }
  }
  const out = new Map<string, string[]>();
  for (const [k, set] of m) out.set(k, [...set]);
  return out;
})();

export interface ExpandedEquipQuery {
  /** Whole-query phrase forms (query + phrase aliases) — exact/prefix tiers. */
  terms: string[];
  /** Per query word, its interchangeable forms — for group-coverage scoring. */
  wordGroups: string[][];
  /** Flattened union of all terms — for substring recall. */
  allTerms: string[];
}

function fixTypo(word: string): string {
  return TYPO_FIX[word] ?? word;
}

/** Expand a normalized query for enhanced matching. Mirrors foodAliases.expandQuery. */
export function expandEquipmentQuery(normalizedQuery: string): ExpandedEquipQuery {
  const q = normalizedQuery.trim();
  const terms = new Set<string>();
  if (q) terms.add(q);
  const phrase = EQUIP_PHRASE_ALIASES[q];
  if (phrase) for (const a of phrase) terms.add(a);

  const rawWords = q.split(/\s+/).filter((w) => w.length >= 2).slice(0, MAX_WORDS);
  const wordGroups: string[][] = [];
  const allTerms = new Set<string>(terms);

  for (const word of rawWords) {
    const canonical = fixTypo(word);
    const group = new Set<string>([word, canonical]);
    const syns = WORD_SYNONYMS.get(canonical);
    if (syns) for (const s of syns) group.add(s);
    const arr = [...group];
    wordGroups.push(arr);
    for (const g of arr) if (allTerms.size < MAX_TERMS) allTerms.add(g);
  }

  return { terms: [...terms], wordGroups, allTerms: [...allTerms] };
}
