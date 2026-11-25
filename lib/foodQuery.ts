// Query understanding and result grouping on top of the ranker
// (lib/foodSearch.ts). Pure: no storage, no React.
//
// Three complaints this answers (Richie, 21 Nov 2026):
//  · "ayam air fryer" found nothing: every word had to match, and no food is
//    named after an air fryer. Cooking methods the catalogue does not name are
//    taken out of the words and kept as a hint.
//  · "ayam" returned a long mixed list: raw cuts, dishes and things that merely
//    contain chicken, interleaved. Results now group by what the word means.
//  · raw chicken was shown as just "Dada ayam": raw or cooked is read from the
//    food so the list can say "mentah".
import { expandCjkQuery, normalize, tokenize } from "./foodSearch.ts";
export { expandCjkQuery };
import { indonesianAliases, spellingVariants } from "./indonesian.ts";

export type CookMethod = "airfry" | "panggang";
export type ParsedQuery = {
  /** The words to search for. */
  text: string;
  /** A cooking method that is not part of any food name. */
  method: CookMethod | null;
  /** The user asked for raw ("mentah"). */
  wantsRaw: boolean;
};

const LEAD = String.raw`(?:(?:pakai|pake|di|dengan|dgn)\s+)?`;
const AIRFRY = new RegExp(String.raw`\b${LEAD}(?:air\s*fryer|airfryer|air\s*fry|airfry)\b`);
const OVEN = new RegExp(String.raw`\b${LEAD}(?:oven|dioven|grill|grilled|panggangan)\b`);
const RAW = /\b(?:mentah|raw)\b/;

export function parseFoodQuery(query: string): ParsedQuery {
  const n = normalize(query);
  let text = n;
  let method: CookMethod | null = null;
  if (AIRFRY.test(text)) {
    method = "airfry";
    text = text.replace(AIRFRY, " ");
  } else if (OVEN.test(text)) {
    method = "panggang";
    text = text.replace(OVEN, " ");
  }
  let wantsRaw = false;
  if (RAW.test(text)) {
    wantsRaw = true;
    text = text.replace(RAW, " ");
  }
  text = text.replace(/\s+/g, " ").trim();
  // A query that is only a method or a state still searches for what was typed.
  if (!text) return { text: n, method: null, wantsRaw: false };
  return { text, method, wantsRaw };
}

/** The longest leading part of the query that finds something. Indonesian
 *  names put the food first, so the words at the end are the ones to let go. */
export function relaxQuery(
  text: string,
  has: (query: string) => boolean,
): string | null {
  const words = text.split(" ").filter(Boolean);
  for (let n = words.length; n > 0; n--) {
    const q = words.slice(0, n).join(" ");
    if (has(q)) return q;
  }
  return null;
}

export type FoodState = "mentah" | "matang" | null;

// Words that make a name a prepared dish rather than an ingredient.
const COOKED = new Set(
  (
    "goreng bakar panggang rebus kukus tumis geprek suwir rica balado opor " +
    "gulai kari rendang semur sate penyet pop katsu karaage crispy krispi " +
    "kremes nugget woku betutu taliwang kecap teriyaki bumbu saus ungkep " +
    "bacem presto pepes madu sambal kuah masak masakan matang cooked fried " +
    "grilled roasted roast baked steamed boiled bbq barbeque"
  ).split(" "),
);

/** Raw, cooked, or unknown. An explicit state wins; otherwise the name, unit
 *  and (for "mentah") the aliases decide. Unknown stays unknown. */
export function foodState(f: {
  name: string;
  aliases?: string;
  unit?: string;
  state?: FoodState;
}): FoodState {
  if (f.state) return f.state;
  const own = normalize(`${f.name} ${f.unit ?? ""}`).split(" ");
  const withAliases = own.concat(normalize(f.aliases ?? "").split(" "));
  if (withAliases.some((w) => w === "mentah" || w === "raw")) return "mentah";
  if (own.some((w) => COOKED.has(w))) return "matang";
  return null;
}

// Words that only say which part, cut or form of the food it is. A name made
// of the food plus these is the ingredient itself ("Dada ayam fillet").
const PLAIN = new Set(
  (
    "dada paha sayap ceker hati ampela kulit kepala leher punggung daging " +
    "fillet filet giling cincang segar utuh potong potongan irisan tanpa " +
    "dengan isi kampung broiler negeri organik ras putih merah hitam coklat " +
    "ungu purple mentah frozen beku tawar biasa kecil besar sedang ekor butir " +
    "samcan kapsim has dalam luar iga chop loin tenderloin belly shoulder ribs " +
    "rib sirloin sengkel polos kupas pork lean " +
    "breast thigh wing wings drumstick mince minced skinless boneless whole " +
    "white brown raw fresh lean ground slice sliced plain"
  ).split(" "),
);
// English names of the staples ("Chicken breast" is ayam).
const SAME_FOOD_EN = new Set(
  (
    "chicken egg eggs rice beef fish pork lamb mutton goat duck tofu tempeh " +
    "salmon tuna shrimp prawn squid oat oats potato banana milk"
  ).split(" "),
);
// Heads that mean "this food, that cut": "Daging ayam", "Dada ayam rebus", "Iga babi".
const CUT_HEAD = new Set(
  "daging dada paha sayap ceker hati ampela kulit fillet filet kepala leher potongan irisan iga".split(" "),
);
// Dish names that put the main ingredient second: "Opor ayam" is a chicken
// dish, while "Mie ayam" or "Soto ayam" are noodles and soup that contain it.
const DISH_OF = new Set(
  (
    "opor gulai sate rendang semur kari kare tongseng rica balado pepes " +
    "garang betutu krengsengan bistik steak tumis oseng sambal penyet"
  ).split(" "),
);

export type GroupKey = "personal" | "bahan" | "masakan" | "mengandung";
export type ResultGroup<T> = { key: GroupKey; title: string; items: T[] };

/**
 * Groups a ranked list for a one-word query:
 *   Sering kamu pilih · Bahan ayam · Masakan ayam · Mengandung ayam.
 * Indonesian names are head-first, so "Ayam goreng" is chicken and "Mie ayam"
 * is noodles. Rank order is kept inside each group, duplicate names are
 * dropped, and the personal group never repeats below. Returns null when the
 * list should stay flat (several words, or too few results to need grouping).
 */
export function groupResults<
  T extends {
    id: string;
    name: string;
    aliases?: string;
    unit?: string;
    state?: FoodState;
  },
>(
  items: readonly T[],
  query: string,
  opts: {
    affinity?: (id: string) => number;
    personalMin?: number;
    preferRaw?: boolean;
    minItems?: number;
  } = {},
): ResultGroup<T>[] | null {
  const tokens = tokenize(query);
  if (tokens.length !== 1) return null;
  const t = tokens[0];
  const family = new Set([
    t,
    ...spellingVariants(t),
    ...indonesianAliases(t).filter((w) => !w.includes(" ")),
  ]);
  const seen = new Set<string>();
  const unique = items.filter((f) => {
    const k = normalize(f.name);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (unique.length < (opts.minItems ?? 6)) return null;

  const min = opts.personalMin ?? 0.25;
  const aff = opts.affinity;
  const personal = aff
    ? unique
        .filter((f) => aff(f.id) >= min)
        .sort((a, b) => aff(b.id) - aff(a.id))
        .slice(0, 3)
    : [];
  const mine = new Set(personal.map((f) => f.id));

  const relation = (f: T): "main" | "dish" | "contains" => {
    const nw = normalize(f.name).split(" ");
    const aw = normalize(f.aliases ?? "").split(" ");
    if (family.has(nw[0]) || family.has(aw[0])) return "main";
    if (CUT_HEAD.has(nw[0]) && nw.slice(1).some((w) => family.has(w)))
      return "main";
    if (DISH_OF.has(nw[0]) && family.has(nw[1] ?? "")) return "dish";
    return "contains";
  };
  // The ingredient itself: raw, or the food plus only plain words.
  const plain = (f: T) => {
    const st = foodState(f);
    if (st) return st === "mentah";
    return normalize(f.name)
      .split(" ")
      .every(
        (w) =>
          family.has(w) || PLAIN.has(w) || SAME_FOOD_EN.has(w) || /^\d/.test(w),
      );
  };
  const bahan: T[] = [],
    masakan: T[] = [],
    mengandung: T[] = [];
  for (const f of unique) {
    if (mine.has(f.id)) continue;
    const r = relation(f);
    if (r === "contains") mengandung.push(f);
    else if (r === "main" && plain(f)) bahan.push(f);
    else masakan.push(f);
  }
  const groups: ResultGroup<T>[] = [
    { key: "bahan", title: `Bahan ${t}`, items: bahan },
    { key: "masakan", title: `Masakan ${t}`, items: masakan },
    { key: "mengandung", title: `Mengandung ${t}`, items: mengandung },
  ];
  if (groups.filter((g) => g.items.length).length < 2) return null;
  const filled = groups.filter((g) => g.items.length);
  const mineGroup: ResultGroup<T>[] = personal.length
    ? [{ key: "personal", title: "Sering kamu pilih", items: personal }]
    : [];
  // Asking for raw ("ayam mentah", or an air fryer) leads with ingredients.
  if (opts.preferRaw && filled[0]?.key === "bahan")
    return [filled[0], ...mineGroup, ...filled.slice(1)];
  return [...mineGroup, ...filled];
}
