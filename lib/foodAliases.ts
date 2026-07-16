// Search alias map for the food catalogue. Keys and values are already in the
// normalized form the search route uses (lowercase, diacritics stripped,
// hyphens generally omitted — Indonesian users tend to type "gado gado", not
// "gado-gado"). When a normalized query matches a key exactly, its canonical
// forms are added as extra terms so trigram/prefix search can find the entry.
//
// This is intentionally a plain object of string[] so it stays trivially
// editable and testable without a DB.

export const FOOD_ALIASES: Record<string, string[]> = {
  // steamed fish/tofu dumpling
  siomay: ["siomay", "somay", "siomai"],
  somay: ["siomay", "somay", "siomai"],
  siomai: ["siomay", "somay", "siomai"],
  // grilled skewers
  sate: ["sate", "satay", "satai"],
  satay: ["sate", "satay", "satai"],
  satai: ["sate", "satay", "satai"],
  // peanut-sauce veggie salad
  "gado gado": ["gado gado", "gado-gado", "gadogado"],
  "gado-gado": ["gado gado", "gado-gado", "gadogado"],
  gadogado: ["gado gado", "gado-gado", "gadogado"],
  // hamburger steak / minced-beef patty
  "hamburg steak": ["hamburg steak", "salad hambug", "hambug", "hamburger"],
  "salad hambug": ["hamburg steak", "salad hambug", "hambug", "hamburger"],
  hambug: ["hamburg steak", "salad hambug", "hambug", "hamburger"],
  // fried rice
  "nasi goreng": ["nasi goreng", "nasgor"],
  nasgor: ["nasi goreng", "nasgor"],
  // meatball soup
  bakso: ["bakso", "baso"],
  baso: ["bakso", "baso"],
};

// ─── English ↔ Indonesian word synonyms ────────────────────────────────────
// Each row is a group of interchangeable words spanning both languages. Typing
// any member should surface foods described with any other member, so "beef
// minced" finds "daging sapi giling" and "chicken" finds "ayam". Groups are
// intentionally single-word (plus a few common two-word compounds) so they can
// be matched per query word. All entries are already normalized.
const SYNONYM_GROUPS: string[][] = [
  // proteins
  ["beef", "sapi", "daging sapi", "daging"],
  ["meat", "daging"],
  ["minced", "mince", "ground", "cincang", "giling", "gilingan"],
  ["chicken", "ayam"],
  ["egg", "eggs", "telur", "telor"],
  ["fish", "ikan"],
  ["shrimp", "prawn", "prawns", "udang"],
  ["squid", "calamari", "cumi", "cumi cumi"],
  ["crab", "kepiting"],
  ["pork", "babi"],
  ["duck", "bebek", "itik"],
  ["lamb", "mutton", "goat", "kambing"],
  ["liver", "hati"],
  ["tofu", "tahu"],
  ["tempeh", "tempe"],
  ["catfish", "lele"],
  ["mackerel", "kembung"],
  ["anchovy", "anchovies", "teri"],
  ["sausage", "sosis"],
  ["nugget", "nuggets", "naget"],
  ["meatball", "meatballs", "bakso", "baso"],
  // carbs / staples
  ["rice", "nasi", "beras"],
  ["noodle", "noodles", "mie", "mi", "bakmi"],
  ["bread", "roti"],
  ["potato", "potatoes", "kentang"],
  ["cassava", "singkong"],
  ["sweet potato", "ubi"],
  ["corn", "jagung"],
  ["flour", "tepung"],
  ["oat", "oats", "oatmeal", "havermut"],
  ["porridge", "congee", "bubur"],
  ["vermicelli", "bihun", "soun"],
  // vegetables
  ["vegetable", "vegetables", "veggie", "sayur", "sayuran"],
  ["spinach", "bayam"],
  ["carrot", "carrots", "wortel"],
  ["tomato", "tomatoes", "tomat"],
  ["onion", "onions", "bawang"],
  ["garlic", "bawang putih"],
  ["chili", "chilli", "chile", "cabai", "cabe", "lombok"],
  ["cucumber", "timun", "mentimun"],
  ["cabbage", "kol", "kubis"],
  ["mushroom", "mushrooms", "jamur"],
  ["bean", "beans", "kacang"],
  ["peanut", "peanuts", "kacang tanah"],
  ["long bean", "kacang panjang"],
  ["water spinach", "kangkung"],
  ["eggplant", "aubergine", "terong", "terung"],
  ["bean sprout", "sprouts", "tauge", "toge"],
  // fruit
  ["fruit", "fruits", "buah"],
  ["apple", "apples", "apel"],
  ["orange", "oranges", "jeruk"],
  ["mango", "mangga"],
  ["banana", "bananas", "pisang"],
  ["pineapple", "nanas"],
  ["papaya", "pepaya"],
  ["watermelon", "semangka"],
  ["avocado", "alpukat", "advokat"],
  ["grape", "grapes", "anggur"],
  ["guava", "jambu"],
  // dairy / drinks
  ["milk", "susu"],
  ["cheese", "keju"],
  ["butter", "mentega"],
  ["yogurt", "yoghurt", "yogurt"],
  ["coffee", "kopi"],
  ["tea", "teh"],
  ["juice", "jus"],
  ["water", "air"],
  ["ice", "es"],
  ["coconut", "kelapa"],
  ["coconut milk", "santan"],
  // condiments / extras
  ["sugar", "gula"],
  ["salt", "garam"],
  ["oil", "minyak"],
  ["honey", "madu"],
  ["sauce", "saus", "sambal"],
  ["soy sauce", "kecap"],
  ["cake", "kue", "bolu"],
  ["biscuit", "cookie", "cookies", "biskuit"],
  ["chocolate", "coklat", "cokelat"],
  ["snack", "snacks", "cemilan", "camilan"],
  ["soup", "soto", "sop", "sup"],
  // preparations / states
  ["fried", "goreng"],
  ["grilled", "roasted", "bakar", "panggang"],
  ["boiled", "rebus"],
  ["steamed", "kukus"],
  ["stir fry", "stir-fry", "tumis", "oseng"],
  ["curry", "kari", "gulai"],
  ["sweet", "manis"],
  ["spicy", "hot", "pedas"],
  ["salted", "salty", "asin"],
];

// word → all interchangeable words (including itself). Multi-word group members
// (e.g. "daging sapi") are keyed under their first token as well so a single
// query word can still reach them.
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
      // Also index by the first token of a multi-word member, so typing one
      // word ("kacang") can still pull in the compound synonyms.
      const first = word.split(" ")[0];
      if (first !== word) add(first, group);
    }
  }
  const out = new Map<string, string[]>();
  for (const [k, set] of m) out.set(k, [...set]);
  return out;
})();

// ─── Common typos → canonical spelling ──────────────────────────────────────
// A precise fast-path for the most frequent misspellings. General typo
// tolerance is handled by the fuzzy (pg_trgm) tier in the search route; this
// map just guarantees the common ones resolve exactly even where trigram search
// is unavailable.
const TYPO_FIX: Record<string, string> = {
  dagin: "daging",
  dging: "daging",
  daing: "daging",
  ayan: "ayam",
  ayma: "ayam",
  aym: "ayam",
  telor: "telur",
  teur: "telur",
  nsi: "nasi",
  nais: "nasi",
  goreg: "goreng",
  gorng: "goreng",
  gorengan: "goreng",
  panggng: "panggang",
  pnggang: "panggang",
  cincag: "cincang",
  cincng: "cincang",
  gilng: "giling",
  sayr: "sayur",
  wortl: "wortel",
  kentag: "kentang",
  cabai: "cabai",
  cabe: "cabai",
  susi: "susu",
  kpi: "kopi",
  chiken: "chicken",
  chicekn: "chicken",
  mincd: "minced",
  minde: "minced",
};

const MAX_TERMS = 32;
const MAX_WORDS = 6;

export interface ExpandedQuery {
  /** Whole-query phrase forms: the query plus any FOOD_ALIASES canonical forms.
   *  Small and precise — used for exact / prefix / word-boundary score tiers. */
  terms: string[];
  /** Per query word, the set of interchangeable forms (word + typo fix +
   *  synonyms). Used for concept coverage scoring (AND across groups). */
  wordGroups: string[][];
  /** Flattened, de-duped union of terms and every wordGroup member. Broad —
   *  used for the WHERE recall filter and substring score tiers. */
  allTerms: string[];
}

/** Correct a single word via the typo map, else return it unchanged. */
function fixTypo(word: string): string {
  return TYPO_FIX[word] ?? word;
}

/**
 * Expand a normalized query for enhanced matching: whole-query aliases, plus
 * per-word English↔Indonesian synonyms and common typo corrections.
 */
export function expandQuery(normalizedQuery: string): ExpandedQuery {
  const q = normalizedQuery.trim();
  // Whole-query phrase forms (existing behaviour).
  const terms = new Set<string>();
  if (q) terms.add(q);
  const phraseAliases = FOOD_ALIASES[q];
  if (phraseAliases) for (const a of phraseAliases) terms.add(a);

  const rawWords = q.split(/\s+/).filter((w) => w.length >= 2).slice(0, MAX_WORDS);
  const wordGroups: string[][] = [];
  const allTerms = new Set<string>(terms);

  for (const word of rawWords) {
    const canonical = fixTypo(word);
    const group = new Set<string>([word, canonical]);
    const syns = WORD_SYNONYMS.get(canonical);
    if (syns) for (const s of syns) group.add(s);
    const groupArr = [...group];
    wordGroups.push(groupArr);
    for (const g of groupArr) {
      if (allTerms.size < MAX_TERMS) allTerms.add(g);
    }
  }

  return {
    terms: [...terms],
    wordGroups,
    allTerms: [...allTerms],
  };
}

/**
 * Expand a normalized query into itself plus any alias canonical forms.
 * Always includes the original query first. De-duplicates.
 *
 * Retained for callers/tests that only need whole-query alias expansion;
 * new code should prefer {@link expandQuery}.
 */
export function expandAliases(normalizedQuery: string): string[] {
  const terms = new Set<string>([normalizedQuery]);
  const aliases = FOOD_ALIASES[normalizedQuery];
  if (aliases) for (const a of aliases) terms.add(a);
  return [...terms];
}
