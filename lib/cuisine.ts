// Heuristic cuisine / "genre" classifier for foods.
//
// The food catalogue has no cuisine column, so we infer one from the dish name
// with an ordered keyword match. It's best-effort: recognizable prepared dishes
// and brands land in a cuisine bucket; raw ingredients and anything unmatched
// fall to "other" (Lainnya). Used to GROUP the food-search results so you can
// scan by Padang / Chinese / Jepang / Barat / Nusantara.

export type CuisineKey =
  | "padang"
  | "japanese"
  | "korean"
  | "chinese"
  | "western"
  | "indonesian"
  | "other";

export type Cuisine = { key: CuisineKey; label: string; emoji: string };

// Display order (most specific cuisines first, "other" last).
export const CUISINES: Cuisine[] = [
  { key: "padang", label: "PADANG", emoji: "🌶️" },
  { key: "japanese", label: "JEPANG", emoji: "🍱" },
  { key: "korean", label: "KOREA", emoji: "🍢" },
  { key: "chinese", label: "CHINESE", emoji: "🥢" },
  { key: "western", label: "BARAT", emoji: "🍔" },
  { key: "indonesian", label: "NUSANTARA", emoji: "🍚" },
  { key: "other", label: "LAINNYA", emoji: "🍽️" },
];

export const CUISINE_BY_KEY: Record<CuisineKey, Cuisine> = Object.fromEntries(
  CUISINES.map((c) => [c.key, c])
) as Record<CuisineKey, Cuisine>;

// Keyword lists, matched in this priority order so a more specific cuisine wins
// (e.g. "Sate Padang" → padang, not the generic "sate" → indonesian).
const RULES: { key: CuisineKey; keys: string[] }[] = [
  {
    key: "padang",
    keys: [
      "rendang", "randang", "gulai", "gulae", "dendeng", "balado", "ayam pop",
      "asam padeh", "kalio", "sate padang", "padang", "rendhang",
    ],
  },
  {
    key: "japanese",
    keys: [
      "sushi", "sashimi", "ramen", "udon", "soba", "katsu", "tonkatsu",
      "teriyaki", "tempura", "onigiri", "miso", "donburi", "gyudon",
      "katsudon", "oyakodon", "gyoza", "takoyaki", "okonomiyaki", "yakitori",
      "teppanyaki", "bento", "matcha", "mochi", "dorayaki", "edamame",
      "wasabi", "yakiniku", "chirashi", "karaage", "shabu",
    ],
  },
  {
    key: "korean",
    keys: [
      "kimchi", "bibimbap", "bulgogi", "tteokbokki", "topokki", "tteok",
      "gochujang", "japchae", "samgyeopsal", "kimbap", "kimbab", "gimbap",
      "ramyeon", "ramyun", "dakgalbi", "corndog", "korean",
    ],
  },
  {
    key: "chinese",
    keys: [
      "capcay", "cap cay", "cap cai", "capcai", "fuyunghai", "fu yung hai",
      "puyunghai", "kwetiau", "kwe tiau", "kwetiaw", "bakmi", "dimsum",
      "dim sum", "siomay", "siomai", "bakpao", "bakpau", "bapao", "bapau",
      "char siu", "cha siu", "kungpao", "kung pao", "koloke", "mapo",
      "ma po", "sapo", "lumpia", "hokkien", "angsio", "wonton", "wanton",
      "pangsit", "fuyung", "ngohiong", "ngohyong", "kekian", "bakcang",
      "bacang", "tekwan", "mie ayam",
    ],
  },
  {
    key: "western",
    keys: [
      "pizza", "burger", "hamburger", "cheeseburger", "pasta", "spaghetti",
      "spageti", "spagheti", "lasagna", "lasagne", "steak", "sandwich",
      "sandwic", "fries", "kentang goreng", "french fries", "nugget",
      "naget", "sosis", "hotdog", "hot dog", "fish and chips", "salad",
      "pancake", "panekuk", "waffle", "wafel", "croissant", "kroisan",
      "donut", "donat", "brownies", "brownie", "cookie", "cookies", "cake",
      "muffin", "macaroni", "makaroni", "carbonara", "bolognese",
      "bolognaise", "hash brown", "cereal", "sereal", "corn flakes",
      "calzone", "risotto", "gnocchi", "meatball",
    ],
  },
  {
    key: "indonesian",
    keys: [
      "nasi goreng", "nasgor", "mie goreng", "mi goreng", "nasi uduk",
      "nasi kuning", "nasi campur", "nasi liwet", "liwet", "soto", "bakso",
      "baso", "gado", "pecel", "rawon", "rujak", "ayam goreng", "ayam bakar",
      "ayam penyet", "ayam geprek", "geprek", "tempe", "tahu", "sate",
      "satay", "gudeg", "gudheg", "empal", "semur", "opor", "sayur asem",
      "sayur lodeh", "lodeh", "urap", "karedok", "ketoprak", "lontong",
      "ketupat", "tumis", "oseng", "botok", "pepes", "garang asem", "coto",
      "bubur ayam", "lalapan", "bakwan", "perkedel", "martabak",
      "kerak telor", "serabi", "klepon", "dadar gulung", "nagasari",
      "lemper", "risoles", "pastel", "cireng", "cilok", "batagor", "pempek",
      "otak-otak", "otak otak", "nasi padang", "rica", "woku", "nasi tim",
    ],
  },
];

/** lowercase + strip diacritics, matching the search normalizer. */
function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/** Infer a cuisine key from a food name. Returns "other" when nothing matches. */
export function cuisineOf(name: string): CuisineKey {
  const n = norm(name);
  for (const rule of RULES) {
    for (const k of rule.keys) {
      if (n.includes(k)) return rule.key;
    }
  }
  return "other";
}
