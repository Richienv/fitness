// The golden query set: what a good answer looks like, written down.
//
// Every ranking change from here on is judged against this file. Without it
// "the search is better now" is an opinion, and the last three attempts at
// fixing food search were exactly that.
//
// The queries are what an Indonesian user actually types — including the
// half-words they type on the way to a full one, the pre-1972 spellings still
// painted on warung signs, and the typos a thumb makes on a phone.
//
// Each case says three things:
//   want    — ids that are genuinely good answers, best first
//   avoid   — ids that must NOT appear near the top. These are the complaints:
//             "Kerak Telor" for "telor", "Telur penyu" for "telur". A ranker
//             that only chases `want` can still be embarrassing.
//   why     — the human reason, so a future reader can disagree with the
//             judgement rather than guess at it.
//
// Ids come from the pool built by searchPool.ts: INGREDIENTS use their own ids
// ("egg"), catalogue rows use their CSV code ("stp-telur", "HR010").

export type GoldenCase = {
  query: string;
  /** Good answers, best first. Rank 1 should be want[0] where stated. */
  want: string[];
  /** Must not appear in the top `avoidWithin` (default 10). */
  avoid?: string[];
  avoidWithin?: number;
  why: string;
};

export const GOLDEN: GoldenCase[] = [
  // ── the complaint, verbatim ──────────────────────────────────────────────
  {
    query: "telur",
    want: ["egg", "stp-telur", "bh-telur-rebus", "stp-telur-goreng"],
    avoid: ["HR010", "pd-telur-balado", "id-telur-balado-warung"],
    why: "Whole egg has a '1 egg' unit and is the entry a logger taps. Turtle egg (HR010) is absurd; Telor Balado is a specific dish nobody asked for.",
  },
  {
    query: "telor",
    want: ["egg", "stp-telur", "bh-telur-rebus"],
    avoid: ["idn-kerak-telor", "idn-cilor", "idn-telur-gabus-keju-kemasan"],
    why: "An alternate spelling of telur must return the same answers. Kerak Telor is a kerak, not an egg — it only wins today because 'telor' is rare.",
  },
  {
    query: "egg",
    want: ["egg", "stp-telur", "bh-telur-rebus"],
    avoid: ["idn-egg-tart-hongkong", "idn-egg-chicken-roll", "HR010"],
    why: "English for the same thing. An Egg Tart is a tart.",
  },

  // ── plain staples: the generic entry should win its own name ─────────────
  {
    query: "nasi",
    want: ["white-rice", "AP001"],
    why: "Plain cooked rice, not a rice dish.",
  },
  {
    query: "ayam",
    want: ["chicken-breast", "chicken-thigh"],
    avoid: ["idn-bayam-mentah"],
    why: "Chicken. 'Bayam' merely contains the letters.",
  },
  {
    query: "tahu",
    want: ["tofu"],
    why: "Indonesian for tofu; the staple row carries the alias.",
  },
  {
    query: "tempe",
    want: ["tempe"],
    why: "Same word, English spelling on the staple row.",
  },
  {
    query: "susu",
    want: ["stp-susu", "DK001", "JR006"],
    why: "Milk.",
  },
  {
    query: "pisang",
    want: ["banana", "frt-pisang"],
    why: "Banana, and the staple has a per-fruit unit.",
  },
  {
    query: "alpukat",
    want: ["frt-alpukat", "ER001"],
    why: "Avocado.",
  },

  // ── dishes: the dish, not an ingredient of it ────────────────────────────
  {
    query: "nasi goreng",
    want: ["nasi-goreng", "id-nasi-goreng"],
    why: "A specific dish that exists as a row.",
  },
  {
    query: "soto ayam",
    want: ["soto-ayam", "id-soto-ayam"],
    why: "The dish, not chicken plus soup.",
  },
  {
    query: "mie ayam",
    want: ["mie-ayam", "id-mie-ayam"],
    why: "The dish.",
  },
  {
    query: "gado gado",
    want: ["gado-gado", "id-gado-gado"],
    why: "Reduplication must collapse to one concept.",
  },
  {
    query: "rendang",
    want: ["rendang", "pd-rendang-sapi"],
    why: "One obvious answer.",
  },

  // ── typos: a thumb on a phone ────────────────────────────────────────────
  {
    query: "ayem",
    want: ["chicken-breast", "chicken-thigh"],
    why: "One transposed vowel from ayam.",
  },
  {
    query: "telorr",
    want: ["egg", "stp-telur"],
    why: "Doubled last letter — the commonest phone typo there is.",
  },

  // ── prefixes: the user is still typing ───────────────────────────────────
  {
    query: "tel",
    want: ["egg", "stp-telur"],
    why: "Three letters in, the egg should already be there.",
  },
  {
    query: "ayа",
    want: ["chicken-breast", "chicken-thigh"],
    why: "Mid-word. Chicken should already lead.",
  },

  // ── English, because the staples are English-named ───────────────────────
  {
    query: "chicken breast",
    want: ["chicken-breast"],
    why: "Exact name of a staple row.",
  },
  {
    query: "rice",
    want: ["white-rice", "AP001"],
    why: "English for nasi.",
  },
];
