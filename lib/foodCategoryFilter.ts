// Pure category filtering, alias-aware search wrapper, and empty-search
// "Mungkin maksudmu" suggestion helper for Catat makan.
// No browser APIs, no "use client".

import { FOOD_ALIASES } from "./foodAliases.ts";
import { relaxQuery } from "./foodQuery.ts";
import {
  editDistance,
  normalize,
  searchPrepared,
  tokenize,
  type Prepared,
  type SearchOptions,
  type SearchableFood,
} from "./foodSearch.ts";

export type FoodCategoryKey =
  | "all"
  | "meat_pork"
  | "poultry_egg"
  | "seafood"
  | "rice_noodle"
  | "veg_fruit"
  | "drinks"
  | "chinese";

export const FOOD_CATEGORIES: readonly { key: FoodCategoryKey; label: string }[] = [
  { key: "all", label: "Semua" },
  { key: "meat_pork", label: "Daging & Babi" },
  { key: "poultry_egg", label: "Ayam & Telur" },
  { key: "seafood", label: "Ikan & Seafood" },
  { key: "rice_noodle", label: "Nasi & Mie" },
  { key: "veg_fruit", label: "Sayur & Buah" },
  { key: "drinks", label: "Minuman" },
  { key: "chinese", label: "Menu China" },
];

export type CategorizableFood = SearchableFood & {
  group?: string;
  zh?: string;
};

const MEAT_PORK_RE =
  /\b(babi|pork|samcan|kapsim|char siu|charsiu|siobak|bakut|baikut|lapcheong|lapciong|sapi|beef|steak|ribeye|sirloin|tenderloin|has dalam|has luar|iga|ribs|dendeng|rendang|empal|rawon|kambing|lamb|mutton|bacon|ham|hongshao|huiguo|lurou|tonkatsu)\b/;
const POULTRY_EGG_RE =
  /\b(ayam|chicken|bebek|duck|itik|puyuh|telur|telor|egg|eggs|omelette|omelet|dada ayam|paha ayam|ceplok|dadar|pitan)\b/;
const SEAFOOD_RE =
  /\b(ikan|fish|salmon|tuna|dori|dory|pangasius|lele|nila|gurame|bandeng|kembung|tongkol|cakalang|teri|udang|shrimp|prawn|cumi|squid|calamari|kepiting|crab|kerang|seafood|pempek|tekwan)\b/;
const RICE_NOODLE_RE =
  /\b(nasi|beras|rice|mie|mi|bakmi|bihun|soun|kwetiau|kwetiaw|ramen|udon|pasta|spaghetti|bubur|congee|lontong|ketupat|roti|bread|sourdough|oat|oatmeal|granola|mantou|bakpao|pau|indomie|lanzhou)\b/;
const VEG_FRUIT_RE =
  /\b(sayur|sayuran|buah|fruit|vegetable|veggie|brokoli|broccoli|bayam|spinach|kangkung|pakcoy|bok choy|sawi|kol|kubis|wortel|carrot|tomat|tomato|timun|cucumber|terong|eggplant|jamur|mushroom|enoki|shiitake|asparagus|buncis|zucchini|pisang|banana|apel|apple|jeruk|orange|mangga|mango|alpukat|avocado|pepaya|semangka|nanas|anggur|melon|blueberry|capcay|gado|urap|pecel|salad)\b/;
const DRINK_RE =
  /\b(kopi|coffee|latte|espresso|americano|teh|tea|matcha|boba|milk tea|jus|juice|susu|milk|yogurt|yoghurt|smoothie|yakult|air putih|air kelapa|doujiang|soy milk|chagee|luckin|mixue)\b/;
const CHINESE_RE =
  /\b(fanqie|chaodan|malatang|mala xiangguo|hongshao|huiguo|yuxiang|gongbao|kungpao|kung pao|mapo|huangmen|shaola|shaoya|lurou|lanzhou|shaxian|jianbing|roujiamo|shengjianbao|xiaolongbao|xiao long bao|shuijiao|guotie|wonton|huntun|doujiang|youtiao|mantou|pitan|char siu|charsiu|siobak|sio bak|bakut|bak kut|samcan|capcay|kwetiau|fuyunghai|dimsum|dim sum|siomay|bakmi|cina|chinese|hainam|chagee|luckin|mixue|pao|bakpao|fantuan)\b/;
const CJK_RE = /[\u4e00-\u9fff]/;

function searchBlob(f: CategorizableFood): string {
  return normalize(
    [f.name, f.englishName ?? "", f.aliases ?? "", f.foodGroup ?? "", f.cuisine ?? ""].join(" "),
  );
}

export function matchesFoodCategory(
  food: CategorizableFood,
  category: FoodCategoryKey,
): boolean {
  if (category === "all") return true;
  const fg = (food.foodGroup ?? "").trim();
  const fgLower = fg.toLowerCase();
  const cuisine = (food.cuisine ?? "").toLowerCase();
  const blob = searchBlob(food);

  switch (category) {
    case "chinese":
      return (
        cuisine === "chinese" ||
        Boolean(food.zh) ||
        CJK_RE.test(food.name) ||
        CHINESE_RE.test(blob)
      );
    case "drinks":
      return (
        fgLower === "minuman" ||
        fgLower === "susu" ||
        food.group === "drink" ||
        DRINK_RE.test(blob)
      );
    case "seafood":
      return fgLower === "ikan dsb" || SEAFOOD_RE.test(blob);
    case "poultry_egg":
      return (
        fgLower === "telur" ||
        (fgLower !== "minuman" && POULTRY_EGG_RE.test(blob))
      );
    case "meat_pork":
      // Guard against "Kacang babi" / "Tempe kacang babi" (legume) appearing under Meat & Pork.
      if (fgLower === "kacang" || /\bkacang babi\b/.test(blob)) return false;
      return (
        (fgLower === "daging" && !/\bayam\b|\bbebek\b/.test(normalize(food.name))) ||
        MEAT_PORK_RE.test(blob)
      );
    case "rice_noodle":
      return (
        fgLower === "serealia" ||
        fgLower === "roti & pastry" ||
        (fgLower !== "minuman" && RICE_NOODLE_RE.test(blob))
      );
    case "veg_fruit":
      return (
        fgLower === "sayur" ||
        fgLower === "buah" ||
        (fgLower === "sayur & sup" && !MEAT_PORK_RE.test(blob) && !POULTRY_EGG_RE.test(blob)) ||
        (fgLower !== "minuman" && VEG_FRUIT_RE.test(blob))
      );
    default:
      return true;
  }
}

/**
 * Search with `FOOD_ALIASES` whole-query expansion layered neatly on top of
 * `searchPrepared`, keeping primary direct matches on top and preserving
 * `searchPrepared` untouched for searchEval invariants.
 */
export function searchCatalogueWithAliases<T extends SearchableFood>(
  prepared: Prepared<T>,
  query: string,
  opts: SearchOptions = {},
): T[] {
  const limit = opts.limit ?? 60;
  const primary = searchPrepared(prepared, query, { ...opts, limit });
  const normQ = normalize(query);
  const aliases = FOOD_ALIASES[normQ];
  if (!aliases?.length) return primary.map((s) => s.food);

  const seen = new Set(primary.map((r) => r.food.id));
  const merged = primary.map((r) => ({ ...r }));

  for (const alt of aliases) {
    if (!alt || alt === normQ) continue;
    const altHits = searchPrepared(prepared, alt, { ...opts, limit: Math.min(limit, 40) });
    for (const h of altHits) {
      if (seen.has(h.food.id)) continue;
      seen.add(h.food.id);
      merged.push({ ...h, score: h.score * 0.94, exact: false });
    }
  }

  merged.sort(
    (a, b) =>
      Number(Boolean(b.exact)) - Number(Boolean(a.exact)) ||
      b.score - a.score ||
      a.food.name.localeCompare(b.food.name, "id"),
  );
  return merged.slice(0, limit).map((r) => r.food);
}

/**
 * Generate calm "Mungkin maksudmu…" fallback suggestions when a query returns 0
 * exact/AND matches:
 *   1. Drop trailing tokens via `relaxQuery`
 *   2. Match individual query tokens (OR fallback)
 *   3. Fuzzy edit-distance / 3-char prefix rescue over index vocabulary
 */
export function suggestRelaxedFoods<T extends SearchableFood>(
  prepared: Prepared<T>,
  query: string,
  opts: { limit?: number; filter?: (f: T) => boolean } = {},
): T[] {
  const limit = opts.limit ?? 4;
  const allow = opts.filter ?? (() => true);
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];

  const out: T[] = [];
  const seen = new Set<string>();
  const push = (foods: readonly T[]) => {
    for (const f of foods) {
      if (seen.has(f.id) || !allow(f)) continue;
      seen.add(f.id);
      out.push(f);
      if (out.length >= limit) return true;
    }
    return false;
  };

  // 1. Multi-word prefix relaxation ("babi bakar spesial" -> "babi bakar" -> "babi")
  if (tokens.length > 1) {
    const relaxed = relaxQuery(
      tokens.join(" "),
      (t) => searchPrepared(prepared, t, { limit: 1 }).length > 0,
    );
    if (relaxed) {
      if (
        push(
          searchPrepared(prepared, relaxed, { limit: limit * 2 }).map(
            (r) => r.food,
          ),
        )
      ) {
        return out;
      }
    }
  }

  // 2. Individual token hits (OR fallback for multi-word misses)
  for (const tok of tokens) {
    if (tok.length < 2) continue;
    if (
      push(
        searchPrepared(prepared, tok, { limit: limit * 2 }).map((r) => r.food),
      )
    ) {
      return out;
    }
  }

  // 3. Relaxed fuzzy / 3-char prefix vocabulary rescue (helps 2-edit typos on short words)
  const vocab = prepared.index.vocabulary;
  const candidateTerms: string[] = [];
  for (const tok of tokens) {
    if (tok.length < 3) continue;
    const prefix3 = tok.slice(0, 3);
    const maxDist = tok.length >= 6 ? 2 : 1;
    let bestTerm: string | null = null;
    let bestScore = Infinity;

    for (const term of vocab) {
      if (term.length < 3) continue;
      const dist =
        Math.abs(term.length - tok.length) <= maxDist
          ? editDistance(tok, term, maxDist)
          : maxDist + 1;
      if (dist <= maxDist && dist < bestScore) {
        bestScore = dist;
        bestTerm = term;
      } else if (!bestTerm && term.startsWith(prefix3)) {
        bestTerm = term;
      }
    }
    if (bestTerm) candidateTerms.push(bestTerm);
  }

  for (const term of candidateTerms) {
    if (
      push(
        searchPrepared(prepared, term, { limit: limit * 2 }).map((r) => r.food),
      )
    ) {
      return out;
    }
  }

  return out;
}
