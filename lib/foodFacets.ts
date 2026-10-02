// The facet classifier: reads a food NAME as base + facets.
//
//   "Ayam Goreng Crispy Paha Atas"  →  base ayam · prep goreng · style crispy · cut paha atas
//   "Soto ayam"                     →  base soto · isi ayam          (ayam is a FILLING here, not the dish)
//   "Chicken breast"                →  base ayam · cut dada          (English, head-final)
//
// WHY A CLASSIFIER AND NOT MORE SEARCH
// Search answers "I know what I am looking for". Logging food is mostly "I ate
// ayam, roughly" — and a flat list of 108 rows beginning "Ayam …" makes you read
// all of them to find "bakar". Seeing the choice as base → how it was cooked →
// which part is how people think, and it is how the picker discloses it: one
// decision per screen, each with a handful of options.
//
// WHY RULES, AND WHY THEY ARE DATA
// 4,575 names, 1,238 distinct first words, Indonesian head-initial and English
// head-final, plus dishes where the first word is NOT the base. A trained model
// would need labelled data this app does not have and would be opaque when it is
// wrong. A vocabulary plus a few structural rules is inspectable: every
// misclassification is a missing or over-eager word in VOCAB, and the census
// (scripts/facetCensus.ts) lists exactly which words the classifier has not
// placed yet, ranked by how many foods they touch. Growing it is editing arrays.
//
// WHAT IT DELIBERATELY DOES NOT DO
// It never invents a food. The picker only offers facet combinations that exist
// as real rows with real macros — see foodFamilies.ts. If there is no "ayam
// bakar paha" row, the UI does not conjure one by scaling "ayam bakar": that
// would be a made-up calorie number presented as data.

import { normalize } from "./foodSearch.ts";

export type FacetAxis = "jenis" | "isi" | "prep" | "cut" | "flavour" | "style" | "state" | "where";

/** The order axes are ASKED in. Cooking method first: it moves calories most
 *  (goreng vs rebus) and is the question people expect after the base. */
export const AXIS_ORDER: FacetAxis[] = ["jenis", "prep", "cut", "style", "flavour", "where", "state"];

/** Dish families (soto, mie, nasi …) ask what is IN it before how it was made:
 *  "mie apa?" comes before "dimasak apa?". */
export const DISH_AXIS_ORDER: FacetAxis[] = ["jenis", "isi", "prep", "cut", "style", "flavour", "where", "state"];

export const AXIS_LABEL: Record<FacetAxis, string> = {
  jenis: "Jenis",
  isi: "Isi",
  prep: "Dimasak",
  cut: "Bagian",
  style: "Gaya",
  flavour: "Bumbu",
  where: "Asal",
  state: "Kondisi",
};

/**
 * The vocabulary. Multi-word entries are matched as phrases, longest first, so
 * "paha atas" is one cut and not "paha" plus a stray "atas".
 *
 * Every entry here was put in because it appears in the real catalogue; the
 * census (npx tsx scripts/facetCensus.ts) reports what is still unplaced.
 */
export const VOCAB: Record<FacetAxis, string[]> = {
  // Never read from a name: "jenis" is assigned when several bases are merged
  // into one tile (ikan + udang + cumi), so the base itself becomes a choice.
  jenis: [],
  // What is IN a dish. Only meaningful after a dish head ("soto ayam"); the
  // classifier still reads it elsewhere ("Nugget Ayam Goreng"), where it is
  // simply a facet the family does not split on.
  isi: [
    "ayam", "sapi", "ikan", "telur", "udang", "tahu", "tempe", "babi", "kambing",
    "bebek", "cumi", "daging", "bakso", "jamur", "kornet", "sosis", "seafood",
    "sayur", "sayuran", "kepiting", "kerang", "babat", "lidah", "kikil",
    "pete", "jengkol", "kentang", "tauge", "teri", "tuna", "salmon",
    "cakalang", "lele", "nila", "bandeng", "gurame", "mujair", "tongkol",
    "chicken", "beef", "fish", "egg", "shrimp",
  ],
  prep: [
    "goreng", "bakar", "rebus", "kukus", "panggang", "geprek", "penyet", "tumis",
    "pepes", "asap", "tim", "presto", "ungkep", "sangrai", "bacem", "rica rica",
    "fried", "grilled", "boiled", "steamed", "roasted", "baked",
  ],
  cut: [
    "paha atas", "paha bawah", "dada", "paha", "sayap", "kepala", "ceker", "usus",
    "hati", "ampela", "kulit", "fillet", "filet", "tulang", "iga", "sirloin",
    "tenderloin", "has dalam", "sandung lamur", "brisket", "breast", "thigh", "wing",
    "drumstick", "leg",
  ],
  style: [
    "crispy", "krispi", "kriuk", "kremes", "tepung", "original recipe", "original",
    "hot and crispy", "spicy", "pedas", "crispi",
  ],
  flavour: [
    "kecap", "madu", "balado", "sambal matah", "sambal bawang", "sambal ijo",
    "sambal", "lada hitam", "saus tiram", "saus padang", "asam manis", "mentega",
    "keju", "mozzarella", "bumbu kuning", "bumbu bali", "bumbu rujak", "bumbu kacang",
    "kuah", "santan", "rica", "cabai hijau", "teriyaki", "barbeque", "bbq",
  ],
  where: [
    "padang", "sunda", "jawa", "bali", "betawi", "manado", "makassar", "bandung",
    "surabaya", "klaten", "kalasan", "warteg", "warung", "resto", "restoran",
    "kantin", "kemasan", "korea", "hainan", "cina",
  ],
  state: [
    "mentah", "segar", "kering", "matang", "instan", "beku", "frozen", "raw",
    "fresh", "dried", "kaleng", "asin",
  ],
};

/** Words that open a COMPOUND DISH: the head is the dish, and the next word is
 *  what is IN it. "Soto ayam" is a soto, not a chicken. */
export const DISH_HEADS = new Set([
  "soto", "sop", "sup", "rawon", "gulai", "kari", "opor", "rendang", "semur",
  "mie", "mi", "bakmi", "bihun", "kwetiau", "kwetau", "bubur", "nasi", "lontong",
  "ketupat", "sate", "satay", "gado", "pecel", "lalapan", "tongseng", "tengkleng",
  "capcay", "cap", "lodeh", "sayur", "tumis", "pempek", "siomay", "batagor",
  "martabak", "roti", "bakso", "cilok", "es", "jus", "kue", "bolu", "kopi", "teh",
]);

/** A leading word that is NOT the base because it only says how it was made or
 *  what state it is in: "Goreng tahu"-style inversions are rare in Indonesian
 *  but English names put modifiers first ("Fried rice", "Grilled chicken"). */
const LEADING_MODIFIERS = new Set([
  "fried", "grilled", "boiled", "steamed", "roasted", "baked", "crispy", "spicy",
  "fresh", "dried", "raw", "frozen",
]);

/** English head nouns → the Indonesian base the rest of the system uses, so an
 *  English-named staple lands in the same family as its Indonesian rows. */
const BASE_ALIASES: Record<string, string> = {
  chicken: "ayam", egg: "telur", rice: "nasi", noodle: "mie", noodles: "mie",
  fish: "ikan", beef: "sapi", pork: "babi", shrimp: "udang", prawn: "udang",
  milk: "susu", bread: "roti", coffee: "kopi", tea: "teh", banana: "pisang",
  tofu: "tahu", tempeh: "tempe", potato: "kentang", cheese: "keju",
  telor: "telur", mi: "mie", bakmi: "mie",
  mushroom: "jamur", tomato: "tomat", soup: "sop", sauce: "saus", yogurt: "yogurt",
  juice: "jus", water: "air", butter: "mentega", cake: "kue", bun: "bakpao",
  porridge: "bubur", congee: "bubur", dumplings: "pangsit", sandwich: "sandwich",
};

/** Words that must NEVER be read as a facet on their own, with the reason. The
 *  census found each of these in rows where the facet reading is simply wrong. */
const AMBIGUOUS = new Set([
  "kuning", // mie kuning = yellow noodles, kuning telur = yolk
  "putih",  // nasi putih = white rice, putih telur = egg white
  "merah", "hijau", "hitam", "manis", "asam", "daun", "biji", "isi", "campur", "jawa",
]);

export type Parsed = {
  /** Normalised base, Indonesian where we know it: "ayam", "soto", "nasi". */
  base: string;
  /** How the base was found — the UI uses "dish" to say "isi", not "ayam". */
  baseKind: "head" | "dish" | "english" | "unknown";
  facets: Record<FacetAxis, string[]>;
  /** What is left after the base and facets — the part that distinguishes
   *  this row ("Sabana", "D'Besto", "Resto"). Kept for display, never guessed at. */
  rest: string[];
};

const emptyFacets = (): Record<FacetAxis, string[]> => ({
  jenis: [], isi: [], prep: [], cut: [], style: [], flavour: [], where: [], state: [],
});

// Phrase index: longest first, so multi-word entries win over their parts.
type Entry = { axis: FacetAxis; words: string[]; canon: string };
const ENTRIES: Entry[] = (Object.keys(VOCAB) as FacetAxis[])
  .flatMap((axis) =>
    VOCAB[axis].map((phrase) => ({ axis, words: normalize(phrase).split(" "), canon: normalize(phrase) }))
  )
  .sort((a, b) => b.words.length - a.words.length);

const ENGLISH_TO_ID: Record<string, string> = {
  fried: "goreng", grilled: "bakar", boiled: "rebus", steamed: "kukus", roasted: "panggang",
  baked: "panggang", breast: "dada", thigh: "paha", wing: "sayap", drumstick: "paha",
  leg: "paha", fresh: "segar", dried: "kering", raw: "mentah", frozen: "beku",
  crispy: "crispy", spicy: "pedas", bbq: "barbeque", crispi: "crispy", krispi: "crispy",
  kriuk: "crispy", filet: "fillet", chicken: "ayam", beef: "sapi", fish: "ikan", egg: "telur", shrimp: "udang",
};

const canonFacet = (canon: string) => ENGLISH_TO_ID[canon] ?? canon;

/**
 * English names are HEAD-FINAL: the noun that says what it IS comes last.
 * "Whole egg" is an egg, "White rice" is rice, "Greek yogurt" is yogurt — the
 * first word is a modifier. Reading them head-initial, as Indonesian is read,
 * filed the 141 curated staples (the foods people tap most) under "whole",
 * "white", "greek", "purple" and "brown", and a cold-start picker led with
 * those. Found by a test that asked which families a new user sees first.
 *
 * Language is detected by vocabulary, not by a model: a name counts as English
 * when at least half its words are known English food words. Two real
 * exceptions are guarded — dish heads and Indonesian bases are never English
 * ("Es teh" contains "tea"-ish tokens but is not an English noun phrase).
 */
const ENGLISH_WORDS = new Set([
  "whole","white","brown","greek","purple","sweet","baby","king","black","green","red","low","small",
  "large","clear","mixed","spicy","fresh","plain","light","dark","extra","hot","cold","iced","fried",
  "grilled","boiled","steamed","roasted","baked","crispy","raw","frozen","dried","sodium","free",
  "egg","eggs","rice","chicken","beef","pork","fish","shrimp","prawn","noodle","noodles","soup","sauce",
  "milk","bread","coffee","tea","latte","water","juice","butter","cheese","potato","tomato","mushroom",
  "yogurt","tofu","tempeh","banana","apple","bar","powder","scoop","steak","slice","mince","jerky",
  "chips","burger","sandwich","salad","pepper","bean","beans","oyster","drop","cream","cake","roll",
  "seeds","seed","nuts","protein","breast","thigh","wing","fillet","porridge","congee","dumplings","bun",
]);

const isEnglishName = (words: string[]): boolean => {
  if (words.length === 0) return false;
  // Indonesian dish heads and bases are never English noun phrases.
  if (DISH_HEADS.has(words[0])) return false;
  // ENGLISH_WORDS only. BASE_ALIASES also holds Indonesian SPELLING variants
  // (telor, mi, bakmi), and counting those as English made "Telor dadar" an
  // English noun phrase whose head-final base was "dadar".
  const hits = words.filter((w) => ENGLISH_WORDS.has(w)).length;
  return hits / words.length >= 0.5 && hits >= 1;
};

/** Phrases that mean ONE thing and must not be split by the head-final rule. */
const ENGLISH_PHRASES: Record<string, string> = {
  "sweet potato": "ubi",
  "bok choy": "pakcoy",
};

// Words that can sit at the FRONT of a name without being the base: they name a
// part, a method, a state or a place, and the real base follows ("Dada ayam",
// "Kulit ayam crispy", "Putih telur", "Goreng ... "). If nothing follows, they
// ARE the base — a lone "Goreng" is better filed under goreng than dropped.
const FRONT_SKIPPABLE = new Set<string>([
  ...VOCAB.prep, ...VOCAB.cut, ...VOCAB.style, ...VOCAB.state, ...VOCAB.where,
  ...LEADING_MODIFIERS, ...AMBIGUOUS,
].flatMap((p) => normalize(p).split(" ")));

/** Parse a name into base + facets. Pure and total: never throws, always
 *  returns something, so a name it cannot read becomes baseKind "unknown"
 *  rather than an exception in the middle of a keystroke.
 *
 *  ORDER MATTERS, and I got it wrong once: facets used to be extracted first and
 *  the base picked from what was left. That broke the moment "ayam" joined the
 *  filling vocabulary — "Ayam Goreng" swallowed its own base as a facet, nothing
 *  was left, and the whole ayam family disappeared (99.5% placed → 93.7%). The
 *  base is chosen FIRST; facets are read from the words around it. */
export function parseFood(name: string): Parsed {
  // A parenthetical is a note about the row ("(1 pack)", "(Member's Mark)",
  // "(estimasi)"), never part of what the food IS. It must not become the base
  // or a facet; it is kept in `rest` so the leaf label can still show it.
  const paren = /\(([^)]*)\)/g;
  const notes = [...name.matchAll(paren)].map((m) => normalize(m[1])).filter(Boolean);
  const core = normalize(name.replace(paren, " "));
  const words = core.split(" ").filter(Boolean);
  const facets = emptyFacets();
  if (words.length === 0) return { base: "", baseKind: "unknown", facets, rest: notes };

  // Reduplication: "gado gado" is one word, written twice.
  for (let i = words.length - 1; i > 0; i--) if (words[i] === words[i - 1]) words.splice(i, 1);

  // 0) A phrase that means one thing.
  const joined = words.join(" ");
  for (const [phrase, base] of Object.entries(ENGLISH_PHRASES)) {
    if (joined === phrase) return { base, baseKind: "english", facets, rest: notes };
  }

  // 1) The base.
  let baseIdx: number;
  let kind: Parsed["baseKind"];
  if (isEnglishName(words)) {
    // Head-final: the LAST word that is not a facet or a bare modifier.
    let i = words.length - 1;
    while (i > 0 && (FRONT_SKIPPABLE.has(words[i]) || words[i] === "scoop" || words[i] === "slice")) i--;
    baseIdx = i;
    kind = "english";
  } else {
    // Head-initial: the first word that is not skippable-at-the-front, provided
    // something real follows it; otherwise the first word, whatever it is.
    baseIdx = words.findIndex((w) => !FRONT_SKIPPABLE.has(w));
    if (baseIdx < 0) baseIdx = 0;
    kind = DISH_HEADS.has(words[baseIdx]) ? "dish" : BASE_ALIASES[words[baseIdx]] ? "english" : "head";
  }
  const baseWord = words[baseIdx];
  const base = BASE_ALIASES[baseWord] ?? baseWord;

  // 2) Facets: read from every OTHER word, longest phrase first, so "paha atas"
  //    is one cut and not "paha" plus a stray "atas".
  const used = new Array<boolean>(words.length).fill(false);
  used[baseIdx] = true;
  for (const e of ENTRIES) {
    for (let i = 0; i + e.words.length <= words.length; i++) {
      if (used.slice(i, i + e.words.length).some(Boolean)) continue;
      if (!e.words.every((w, k) => words[i + k] === w)) continue;
      // An ambiguous word is never a facet by itself ("kuning" is yellow
      // noodles OR egg yolk); it can still be part of a longer phrase.
      if (e.words.length === 1 && AMBIGUOUS.has(e.words[0])) continue;
      for (let k = 0; k < e.words.length; k++) used[i + k] = true;
      const c = canonFacet(e.canon);
      if (!facets[e.axis].includes(c)) facets[e.axis].push(c);
    }
  }

  return { base, baseKind: kind, facets, rest: [...words.filter((_, i) => !used[i]), ...notes] };
}

/** A stable key for "the same food spelled the same way", used to collapse the
 *  exact-name duplicates the catalogue carries from several sources. */
export function nameKey(name: string): string {
  return normalize(name).replace(/\bestimasi\b/g, "").replace(/\s+/g, " ").trim();
}
