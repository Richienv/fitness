// MUNGKIN KELUPAAN — what's probably missing from this plate.
//
// This is a rule-based stand-in, deliberately kept behind one function so a
// real model can replace `suggestions()` without touching the UI. The rules
// encode what someone eating Indonesian food actually forgets to log: the
// rice, the sambal, the drink.
//
// Nothing here talks to the network or reads storage — it's a pure function of
// what's already in the tray, which is what makes it testable and free.

export type TrayFact = {
  id: string;
  /** Bucket: protein / carb / vegetable / extra / drink. */
  cat: string;
};

export type SuggestionInput = {
  tray: TrayFact[];
  /** Grams of protein already in the tray. */
  protein: number;
  /** Ids the user has waved away this session. */
  dismissed?: readonly string[];
};

export type Suggestion = {
  /** Stable key for this suggestion, used for dismissal. Not a food id — the
   *  catalogue differs between builds, so the concrete food is resolved by the
   *  caller from `candidates` / `match`. */
  key: string;
  /** Preferred food ids, best first. */
  candidates: string[];
  /** Fallback: match a food by name when none of the ids exist. Without this
   *  a catalogue that names things differently would silently show nothing. */
  match: RegExp;
  /** Why it's being suggested, in Bahasa, addressed as `kamu`. */
  why: string;
  /** 0..1 — drives both the bar width and the "{n}% yakin" caption. */
  conf: number;
};

/** Protein floor below which the plate reads as under-built. */
export const PROTEIN_FLOOR_G = 30;

/** Most suggestions shown at once. More than this and it stops being a hint. */
export const MAX_SUGGESTIONS = 4;

/**
 * Rank what's missing. Ordered by confidence, capped, and never suggesting
 * something already in the tray or already dismissed.
 *
 * Swap this whole function for a model call and the UI needs no changes — it
 * only depends on the returned shape.
 */
/** The things worth being reminded about, and how to find them in whatever
 *  catalogue this build happens to have. */
const RULES: Omit<Suggestion, "why" | "conf">[] = [
  { key: "nasi", candidates: ["nasi-putih", "white-rice", "nasi-uduk"], match: /\bnasi putih\b|\bwhite rice\b|\bnasi\b/i },
  { key: "telur", candidates: ["telur-rebus", "boiled-egg", "telur-balado", "egg"], match: /\btelur\b|\begg\b/i },
  { key: "sayur", candidates: ["brokoli", "broccoli", "capcay"], match: /\bbrokoli\b|\bbroccoli\b|\bsayur\b|\bcapcay\b/i },
  { key: "sambal", candidates: ["sambal", "sambal-terasi"], match: /\bsambal\b/i },
  { key: "minum", candidates: ["kopi-susu", "es-teh", "kopi"], match: /\bkopi\b|\bes teh\b|\bteh\b/i },
];

const RULE = Object.fromEntries(RULES.map((r) => [r.key, r])) as Record<
  string,
  Omit<Suggestion, "why" | "conf">
>;

export function suggestions(input: SuggestionInput): Suggestion[] {
  const { tray, protein } = input;
  // An empty plate has nothing to be missing FROM — suggesting rice before
  // you've logged anything is just noise.
  if (tray.length === 0) return [];

  const dismissed = new Set(input.dismissed ?? []);
  const present = new Set(tray.map((t) => t.id));
  const cats = new Set(tray.map((t) => t.cat));

  const out: Suggestion[] = [];
  const push = (key: string, why: string, conf: number) => {
    const rule = RULE[key];
    if (!rule || dismissed.has(key)) return;
    // Don't suggest something already on the plate.
    if (rule.candidates.some((c) => present.has(c))) return;
    if (out.some((s) => s.key === key)) return;
    out.push({ ...rule, why, conf });
  };

  if (!cats.has("carb")) push("nasi", "hampir selalu kamu pakai nasi", 0.92);
  if (protein < PROTEIN_FLOOR_G) push("telur", "protein masih di bawah target", 0.86);
  if (!cats.has("vegetable")) push("sayur", "belum ada sayur di piring ini", 0.74);
  if (cats.has("protein")) push("sambal", "kamu sering nambah sambal", 0.61);
  if (!cats.has("drink")) push("minum", "biasanya minum setelah makan", 0.44);

  return out.sort((a, b) => b.conf - a.conf).slice(0, MAX_SUGGESTIONS);
}
