// Okapi BM25 for very short documents.
//
// WHY BM25 AND NOT SOMETHING NEW: the previous ranker was a bespoke tier table
// — EXACT=100, PREFIX=60, … FUZZY=16 — with hand-tuned field weights. It worked,
// but every number in it was a guess, and there was no principle to appeal to
// when two guesses disagreed. BM25 (Robertson & Spärck Jones; the Okapi
// weighting used in TREC and the default in Lucene/Elasticsearch since 5.0) is
// the standard answer for exactly this problem, and it earns its scores from
// the corpus instead of from a table:
//
//   score(D,Q) = Σ_t  IDF(t) · ( f(t,D)·(k1+1) ) / ( f(t,D) + k1·(1 - b + b·|D|/avgdl) )
//   IDF(t)     = ln( 1 + (N - n(t) + 0.5) / (n(t) + 0.5) )
//
// The property that matters here is IDF. In a catalogue of Indonesian food,
// "ayam" appears in hundreds of names and "betutu" in one. A tier table scores
// both as "an exact token hit"; BM25 knows the second one told you far more.
// Nobody had to encode that — it falls out of the counts.
//
// TUNING FOR SHORT DOCUMENTS. A food name is 2–5 words, not a paragraph, so the
// defaults from long-document retrieval are wrong here:
//
//   b  = 0.3, not 0.75. `b` controls how hard a long document is penalised.
//        Across documents this short, length differences are mostly a matter of
//        how specific the dish name is ("Ayam Goreng" vs "Ayam Goreng Lengkuas
//        Kalasan"), not padding — so heavy normalisation would punish precise
//        names for being precise. Some normalisation is still wanted, because
//        "Ayam Goreng" really is the better answer for the query "ayam goreng",
//        so this lands well below the default rather than at zero.
//
//   k1 = 1.2, the standard value, but it barely matters: k1 controls term
//        saturation and a food name almost never repeats a term. Kept at the
//        conventional value so the formula is recognisable.
//
// This file is the scoring engine only. Tokenisation, typo tolerance and the
// Indonesian-specific handling live in lib/foodSearch.ts, which calls in here.

export const BM25_K1 = 1.2;

/** Length normalisation. Low on purpose — see the note above. */
export const BM25_B = 0.3;

export type Bm25Field = {
  /** Field name, for weighting. */
  name: string;
  /** How much a hit in this field is worth relative to the others. */
  weight: number;
};

export type Bm25Doc = {
  /** Tokens per field, already normalised by the caller. */
  fields: Record<string, string[]>;
};

type Posting = {
  /** doc index -> term frequency in that doc, summed over weighted fields */
  tf: Map<number, number>;
  /** number of docs containing the term in any field */
  df: number;
};

export type Bm25Index = {
  n: number;
  /** term -> posting list */
  postings: Map<string, Posting>;
  /** weighted length of each doc */
  len: Float64Array;
  avgdl: number;
  /** every distinct term, for the fuzzy layer to search over */
  vocabulary: string[];
};

/**
 * Build the index. This is BM25F in the sense that fields carry different
 * weights, but the weighting is applied to term frequency before scoring
 * (Robertson's "combined field" formulation) rather than by scoring each field
 * separately and summing — the latter double-counts IDF across fields, which
 * on documents this short skews badly toward foods that happen to repeat a
 * word in both their Indonesian and English name.
 */
export function buildIndex(docs: Bm25Doc[], fields: Bm25Field[]): Bm25Index {
  const postings = new Map<string, Posting>();
  const len = new Float64Array(docs.length);
  let total = 0;

  for (let i = 0; i < docs.length; i++) {
    const seen = new Set<string>();
    let dl = 0;
    for (const f of fields) {
      const toks = docs[i].fields[f.name];
      if (!toks) continue;
      for (const t of toks) {
        dl += f.weight;
        let p = postings.get(t);
        if (!p) {
          p = { tf: new Map(), df: 0 };
          postings.set(t, p);
        }
        p.tf.set(i, (p.tf.get(i) ?? 0) + f.weight);
        if (!seen.has(t)) {
          seen.add(t);
          p.df += 1;
        }
      }
    }
    len[i] = dl;
    total += dl;
  }

  return {
    n: docs.length,
    postings,
    len,
    avgdl: docs.length > 0 ? total / docs.length : 1,
    vocabulary: [...postings.keys()],
  };
}

/**
 * Probabilistic IDF with the +1 guard.
 *
 * The textbook form ln((N - n + 0.5)/(n + 0.5)) goes NEGATIVE once a term
 * appears in more than half the corpus, which would make a food score worse
 * for matching a common word than for not matching it at all. In a food
 * catalogue that is not hypothetical — "ayam" is in a large fraction of rows.
 * The +1 inside the log is Lucene's fix and keeps it non-negative.
 */
export function idf(index: Bm25Index, term: string): number {
  const p = index.postings.get(term);
  const df = p?.df ?? 0;
  return Math.log(1 + (index.n - df + 0.5) / (df + 0.5));
}

/**
 * BM25 contribution of one term to one document.
 *
 * `tfOverride` lets the caller feed a REDUCED frequency for a term that only
 * matched approximately — a fuzzy or prefix hit is evidence, but weaker
 * evidence than the word actually being there, and expressing that as a
 * fraction of a term occurrence keeps it inside the same formula instead of
 * bolting a second scoring system onto the side.
 */
export function termScore(
  index: Bm25Index,
  term: string,
  docIdx: number,
  tfOverride?: number,
  idfTerm?: string
): number {
  const p = index.postings.get(term);
  const rawTf = tfOverride ?? p?.tf.get(docIdx) ?? 0;
  if (rawTf <= 0) return 0;
  const norm = 1 - BM25_B + BM25_B * (index.len[docIdx] / (index.avgdl || 1));
  // A synonym match is worth the MORE CONSERVATIVE of the two IDFs.
  //
  // Not the variant's alone: expanding "ayam" to "chicken" would hand the match
  // the rarity bonus of a handful of English-named rows, and "Chicken katsu"
  // outranks "Ayam" for the query "ayam". The user's need is the common word.
  //
  // But not the typed word's alone either: a word the corpus has never seen
  // gets maximum IDF, so a query for an unknown term that only matches via a
  // synonym would score HIGHER than querying the synonym directly — an alias
  // route beating the real thing.
  //
  // min() is the honest answer: an alias can be worth at most what the word it
  // matched is worth, and at most what the user actually asked for is worth.
  const useIdf =
    idfTerm && idfTerm !== term
      ? Math.min(idf(index, term), idf(index, idfTerm))
      : idf(index, term);
  return useIdf * ((rawTf * (BM25_K1 + 1)) / (rawTf + BM25_K1 * norm));
}

/** Docs containing a term at all — the candidate set for a query token. */
export function docsFor(index: Bm25Index, term: string): Iterable<number> {
  return index.postings.get(term)?.tf.keys() ?? [];
}
