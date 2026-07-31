// Indonesian-specific handling for food search.
//
// Indonesian is agglutinative but largely non-inflecting: there is no tense,
// no gender, no plural suffix. That matters, because it means a FULL stemmer —
// Nazief-Adriani, as implemented by Sastrawi — is the wrong tool here. Those
// strip derivational affixes to find a root, which is right for document
// retrieval over prose and wrong for food names, where the affix is usually
// the dish:
//
//   "gorengan"  is not  "goreng"   — gorengan is the fritter, goreng is fried
//   "makanan"   is not  "makan"    — one is food, the other is eating
//   "bakaran"   ~       "bakar"    — but "ikan bakaran" is nobody's dish name
//
// Over-stemming a 2-5 word document is far more damaging than under-stemming a
// paragraph: there is no other term left to recover the meaning from. So the
// rules below are deliberately narrow and enumerated rather than general.
//
// Everything here is a QUERY-SIDE expansion. The catalogue is never rewritten,
// so a bad rule can only add a candidate, never destroy a name.

/** Verbal prefixes that leave the food unchanged: di- (passive), me-/meng-
 *  (active). "digoreng" and "goreng" are the same fried thing. */
const VERB_PREFIXES = ["di", "meng", "meny", "mem", "men", "me", "ter", "ber"];

/**
 * Affix variants of a token that mean the same food.
 *
 * Returns candidates, not a decision — the caller tries each and keeps the
 * best-scoring, so a wrong guess costs nothing but a comparison.
 */
export function affixVariants(token: string): string[] {
  const out = new Set<string>();
  if (token.length < 5) return [];

  for (const p of VERB_PREFIXES) {
    if (token.startsWith(p) && token.length - p.length >= 4) {
      out.add(token.slice(p.length));
    }
  }
  // -nya is a possessive/definite clitic, never part of a food name:
  // "ayamnya" is "the chicken".
  if (token.endsWith("nya") && token.length >= 7) out.add(token.slice(0, -3));

  out.delete(token);
  return [...out];
}

/**
 * Reduplication: "gado-gado", "cumi-cumi", "kupu-kupu".
 *
 * Normalisation already turns the hyphen into a space, so the tokens arrive as
 * ["gado","gado"]. Two problems follow. The pair is one concept, so scoring it
 * as two independent term matches double-counts it; and someone typing the
 * singular "cumi" should still find "Cumi-Cumi".
 *
 * Collapsing an ADJACENT repeat handles both, and is safe because Indonesian
 * does not otherwise repeat a word immediately — "nasi nasi" is not a phrase.
 */
export function collapseReduplication(tokens: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (i > 0 && tokens[i] === tokens[i - 1]) continue;
    out.push(tokens[i]);
  }
  return out;
}

/**
 * Spellings that are common enough to be worth naming.
 *
 * These are NOT typos — a typo is a slip, and edit distance already forgives
 * those. These are variant orthographies people genuinely believe in, several
 * of them pre-1972 spellings still used on warung signs (oe/u, dj/j, tj/c).
 * Edit distance cannot help with most of them: "cabe"/"cabai" is one edit but
 * "terasi"/"trasi" changes length, and a 4-letter word gets a budget of 1.
 */
const VARIANTS: Record<string, string[]> = {
  cabe: ["cabai"], cabai: ["cabe"],
  bawal: ["bawal"],
  trasi: ["terasi"], terasi: ["trasi"],
  singkong: ["ubi kayu"], ketela: ["singkong"],
  tauge: ["toge", "taoge"], toge: ["tauge"], taoge: ["tauge"],
  bihun: ["bihoen"], mi: ["mie"],
  kueh: ["kue"],
  telor: ["telur"], telur: ["telor", "egg"], egg: ["telur"],
  jengkol: ["jering"],
  baso: ["bakso"],
  soto: ["sroto"],
  es: ["ice"], ice: ["es"],
  ayam: ["chicken"], chicken: ["ayam"],
  ikan: ["fish"], fish: ["ikan"],
  sapi: ["beef"], beef: ["sapi"],
  udang: ["shrimp", "prawn"], shrimp: ["udang"], prawn: ["udang"],
  nasi: ["rice"], rice: ["nasi"],
  telurr: ["telur"],
  goreng: ["fried"], fried: ["goreng"],
  bakar: ["grilled", "panggang"], grilled: ["bakar"], panggang: ["bakar"],
  rebus: ["boiled"], boiled: ["rebus"],
  kukus: ["steamed"], steamed: ["kukus"],
  pedas: ["spicy"], spicy: ["pedas"],
  manis: ["sweet"], sweet: ["manis"],
  susu: ["milk"], milk: ["susu"],
  tahu: ["tofu"], tofu: ["tahu"],
  tempe: ["tempeh"], tempeh: ["tempe"],
  kentang: ["potato"], potato: ["kentang"],
  jamur: ["mushroom"], mushroom: ["jamur"],
  wortel: ["carrot"], carrot: ["wortel"],
  bayam: ["spinach"], spinach: ["bayam"],
  timun: ["cucumber"], cucumber: ["timun"],
  tomat: ["tomato"], tomato: ["tomat"],
  jagung: ["corn"], corn: ["jagung"],
  kacang: ["nut", "bean", "peanut"], peanut: ["kacang"], bean: ["kacang"],
  pisang: ["banana"], banana: ["pisang"],
  apel: ["apple"], apple: ["apel"],
  jeruk: ["orange"], orange: ["jeruk"],
  mangga: ["mango"], mango: ["mangga"],
  alpukat: ["avocado"], avocado: ["alpukat"],
  kelapa: ["coconut"], coconut: ["kelapa"],
  mie: ["mi", "noodle", "noodles"], noodle: ["mie"], noodles: ["mie"],
  bubur: ["porridge", "congee"], porridge: ["bubur"], congee: ["bubur"],
  sate: ["satay"], satay: ["sate"],
  bakso: ["baso", "meatball"], meatball: ["bakso"],
  kambing: ["goat", "mutton"], goat: ["kambing"],
  bebek: ["duck"], duck: ["bebek"],
  babi: ["pork"], pork: ["babi"],
  cumi: ["squid", "calamari"], squid: ["cumi"],
  daging: ["meat"], meat: ["daging"],
  kue: ["kueh", "cake"], cake: ["kue"],
  air: ["water"], water: ["air"],
  kopi: ["coffee"], coffee: ["kopi"],
  teh: ["tea"], tea: ["teh"],
  roti: ["bread"], bread: ["roti"],
  keju: ["cheese"], cheese: ["keju"],
  sayur: ["vegetable", "veggie"], vegetable: ["sayur"],
  buah: ["fruit"], fruit: ["buah"],
};

/** Everything this token could also mean: spelling variants, the other
 *  language, and affix-stripped forms. */
export function indonesianAliases(token: string): string[] {
  const out = new Set<string>(VARIANTS[token] ?? []);
  for (const v of affixVariants(token)) {
    out.add(v);
    for (const w of VARIANTS[v] ?? []) out.add(w);
  }
  out.delete(token);
  return [...out];
}
