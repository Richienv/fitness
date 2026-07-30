// Turn "nasi ayam goreng sambal" into nasi putih + ayam goreng + sambal.
//
// THE ALGORITHM IS NOT NEW. This is dictionary-based word segmentation — the
// standard approach for languages written without reliable delimiters, where
// the job is to cut a string into dictionary entries. Indonesian food text has
// the same shape: "nasigoreng" is two words but "nasi goreng" is one dish, and
// spaces tell you nothing about which.
//
// The pieces, all off the shelf:
//
//   * Forward Maximum Matching (FMM) and Backward Maximum Matching (BMM) —
//     greedily take the longest dictionary entry from each end. Classical
//     Chinese-segmentation baselines.
//   * Bi-directional matching — run both and pick the better parse. Standard,
//     and it exists because greedy-from-one-end is provably wrong sometimes.
//   * MMSEG's tie-breaking heuristics (Tsai, 2000) — when two parses tie on
//     coverage, prefer fewer words, then greater average word length, then
//     lower variance in word length. Adopted here in that order.
//
// WHY GREEDY ALONE FAILS, concretely. Dictionary contains "nasi", "goreng",
// "ayam", "nasi goreng", "ayam goreng". Input "nasi goreng ayam":
//   FMM takes "nasi goreng", leaves "ayam"        -> 2 parts  ✓
//   Input "nasi ayam goreng":
//   FMM takes "nasi", then "ayam goreng"          -> 2 parts  ✓
//   but a naive longest-first over the whole string could take "ayam goreng"
//   first and strand "nasi" — same parts, different confidence. Running both
//   directions and scoring the results is what makes this reliable rather
//   than lucky.
//
// THE NUTRITION-SPECIFIC RULE. If the whole query is itself a known dish, that
// always wins. "Nasi goreng" as one catalogue row is a measured composition of
// a real plate — rice fried in oil with kecap and egg. Reconstructing it as
// "nasi putih + minyak" would miss what the dish actually is. A composite beats
// its parts whenever the composite exists; parts are the fallback, not the goal.

export type DishTerm = {
  id: string;
  /** Normalized name, lowercase, single-spaced. */
  norm: string;
  /** Token count — the unit of "longest match". */
  size: number;
};

export type ParsePart = {
  id: string;
  /** The dictionary phrase that matched. */
  matched: string;
  /** Where it came from in the query, for highlighting. */
  from: number;
  to: number;
};

export type ParseResult = {
  /** The single best interpretation. */
  parts: ParsePart[];
  /** Tokens no dictionary entry covered. */
  unmatched: string[];
  /** 0..1. High means every token was covered by few, long entries. */
  confidence: number;
  /** True when the ENTIRE query is one known dish — prefer it as-is. */
  whole: boolean;
};

/**
 * Modifiers that mark the UNADORNED version of a staple.
 *
 * A bare "nasi" should resolve to Nasi Putih, not Nasi Uduk — but both are
 * two-word names, so length can't choose between them and picking the shorter
 * string is just a coin flip that happens to land on coconut rice. These are
 * the words that mean "plain", and an entry carrying one is the honest default
 * reading of the bare noun.
 */
const PLAIN_MODIFIERS = new Set([
  "putih", "rebus", "kukus", "tawar", "biasa", "segar", "mentah", "polos",
]);

/** Lower is a better answer for a bare head word. */
function headRank(t: { norm: string; size: number }): number {
  if (t.size === 1) return 0; // the word itself is a catalogue entry
  const second = t.norm.split(" ")[1];
  if (t.size === 2 && PLAIN_MODIFIERS.has(second)) return 1;
  return 2 + t.size; // otherwise prefer fewer words
}

/** Words that mean "leave this out", so the part after them is not added. */
const NEGATIONS = new Set(["tanpa", "no", "gak", "ga", "nggak", "kecuali", "minus"]);

/** Filler that should never block a match or count against coverage. */
const STOPWORDS = new Set(["dan", "sama", "pakai", "pake", "plus", "with", "dengan", "the", "porsi"]);

export function normalizeDish(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    // "+" is how people actually write a composed plate; treat it as a space.
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function buildDictionary(
  foods: readonly { id: string; name: string }[]
): { terms: Map<string, DishTerm[]>; maxSize: number; heads: Map<string, DishTerm> } {
  const terms = new Map<string, DishTerm[]>();
  // Head-word index: "nasi" -> the shortest entry beginning with "nasi".
  //
  // People type the bare noun. "nasi ayam goreng" means white rice with fried
  // chicken, but no catalogue row is called just "Nasi" — it's "Nasi Putih".
  // Without this, "nasi" matches nothing and silently vanishes from the plate,
  // which is the difference between logging 600 kcal and logging 400.
  //
  // Shortest wins deliberately: the least-adorned entry is the least
  // presumptuous reading of a bare word. "nasi" resolves to Nasi Putih, not to
  // Nasi Goreng Kambing.
  const heads = new Map<string, DishTerm>();
  let maxSize = 1;
  for (const f of foods) {
    const norm = normalizeDish(f.name);
    if (!norm) continue;
    const words = norm.split(" ");
    const size = words.length;
    if (size > maxSize) maxSize = size;
    const list = terms.get(norm);
    // Several catalogue rows share a name (two "Gado-gado" entries). Keep them
    // all; the caller picks by whatever policy it wants.
    if (list) list.push({ id: f.id, norm, size });
    else terms.set(norm, [{ id: f.id, norm, size }]);

    const head = words[0];
    const cur = heads.get(head);
    if (!cur || headRank({ norm, size }) < headRank(cur)) {
      heads.set(head, { id: f.id, norm, size });
    }
  }
  return { terms, maxSize, heads };
}

type Dict = ReturnType<typeof buildDictionary>;

/** One greedy pass. `dir` -1 runs backward (BMM), +1 forward (FMM). */
function greedy(tokens: string[], dict: Dict, dir: 1 | -1): ParsePart[] {
  const out: ParsePart[] = [];
  const n = tokens.length;
  let i = dir === 1 ? 0 : n;

  while (dir === 1 ? i < n : i > 0) {
    let taken = 0;
    const max = Math.min(dict.maxSize, dir === 1 ? n - i : i);
    // Longest first — that is what makes it "maximum" matching.
    for (let len = max; len >= 1; len--) {
      const from = dir === 1 ? i : i - len;
      const phrase = tokens.slice(from, from + len).join(" ");
      const hit = dict.terms.get(phrase);
      if (hit && hit.length > 0) {
        out.push({ id: hit[0].id, matched: phrase, from, to: from + len });
        taken = len;
        break;
      }
    }
    if (taken === 0) {
      i += dir; // no entry starts here; skip one token
    } else {
      i += dir * taken;
    }
  }
  return dir === 1 ? out : out.reverse();
}

/** MMSEG-style comparison: more coverage, then fewer parts, then longer
 *  average part, then lower variance. Returns true if `a` is the better parse. */
function better(a: ParsePart[], b: ParsePart[]): boolean {
  const cov = (x: ParsePart[]) => x.reduce((s, p) => s + (p.to - p.from), 0);
  const ca = cov(a), cb = cov(b);
  if (ca !== cb) return ca > cb;
  if (a.length !== b.length) return a.length < b.length;
  const avg = (x: ParsePart[]) => (x.length ? cov(x) / x.length : 0);
  const aa = avg(a), ab = avg(b);
  if (aa !== ab) return aa > ab;
  const varOf = (x: ParsePart[]) => {
    if (!x.length) return 0;
    const m = avg(x);
    return x.reduce((s, p) => s + ((p.to - p.from) - m) ** 2, 0) / x.length;
  };
  return varOf(a) <= varOf(b);
}

/**
 * Parse a free-text plate into catalogue parts.
 *
 * Returns `whole: true` when the query is itself one known dish — the caller
 * should then just log that dish rather than a reconstruction of it.
 */
export function parseDish(query: string, dict: Dict): ParseResult {
  const norm = normalizeDish(query);
  if (!norm) return { parts: [], unmatched: [], confidence: 0, whole: false };

  // A known composite always wins over its own ingredients.
  const exact = dict.terms.get(norm);
  if (exact && exact.length > 0) {
    const size = norm.split(" ").length;
    return {
      parts: [{ id: exact[0].id, matched: norm, from: 0, to: size }],
      unmatched: [],
      confidence: 1,
      whole: true,
    };
  }

  const raw = norm.split(" ");
  // Drop exclusions and everything they govern, plus pure filler, BEFORE
  // segmenting — "nasi goreng tanpa telur" must not add telur.
  const tokens: string[] = [];
  const excluded: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    if (NEGATIONS.has(raw[i])) {
      if (raw[i + 1]) excluded.push(raw[i + 1]);
      i++; // consume the excluded word too
      continue;
    }
    if (STOPWORDS.has(raw[i])) continue;
    if (/^\d+$/.test(raw[i])) continue; // "2 potong" — quantity, not a food
    tokens.push(raw[i]);
  }
  if (tokens.length === 0) return { parts: [], unmatched: excluded, confidence: 0, whole: false };

  const fwd = greedy(tokens, dict, 1);
  const bwd = greedy(tokens, dict, -1);
  const parts = better(fwd, bwd) ? fwd : bwd;

  const covered = new Set<number>();
  for (const p of parts) for (let i = p.from; i < p.to; i++) covered.add(i);

  // Second pass over what segmentation left behind: resolve a bare noun to the
  // plainest entry that starts with it. This is a fallback, not a match — it
  // only runs on tokens nothing else claimed, and it is deliberately weaker
  // evidence, so the confidence discount below applies to it.
  let assumed = 0;
  for (let i = 0; i < tokens.length; i++) {
    if (covered.has(i)) continue;
    const head = dict.heads.get(tokens[i]);
    if (!head) continue;
    parts.push({ id: head.id, matched: head.norm, from: i, to: i + 1 });
    covered.add(i);
    assumed++;
  }
  parts.sort((a, b) => a.from - b.from);

  const unmatched = tokens.filter((_, i) => !covered.has(i));

  // Confidence is coverage, discounted for fragmentation: three parts covering
  // everything is a confident read; six scraps covering everything is not.
  const coverage = tokens.length ? covered.size / tokens.length : 0;
  const fragPenalty = parts.length > 1 ? Math.min(0.25, (parts.length - 1) * 0.06) : 0;
  // A head-word guess is a reading, not a match — say so in the number.
  const assumePenalty = Math.min(0.2, assumed * 0.08);
  const confidence = Math.max(0, Math.min(1, coverage - fragPenalty - assumePenalty));

  return { parts, unmatched: [...unmatched, ...excluded], confidence, whole: false };
}
