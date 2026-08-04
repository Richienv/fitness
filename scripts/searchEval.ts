// Scores the ranker against the golden set.
//
//   npx tsx scripts/searchEval.ts            # summary + failures
//   npx tsx scripts/searchEval.ts --all      # every case
//   npx tsx scripts/searchEval.ts telur      # one query, with its top 10
//
// Three metrics, because they fail differently:
//   MRR      — how far down the FIRST good answer is. This is what a user feels.
//   NDCG@10  — whether the good answers are ordered well among themselves.
//   Clean@10 — the fraction of cases with no `avoid` id in the top 10. This is
//              the one that catches "Kerak Telor is still there", which MRR and
//              NDCG happily ignore as long as something right is also present.

import { prepare, searchPrepared } from "../lib/foodSearch.ts";
import { buildPool, type PoolFood } from "./searchPool.ts";
import { GOLDEN, type GoldenCase } from "./searchGolden.ts";

const TOP = 10;

export type CaseResult = {
  c: GoldenCase;
  ranks: (number | null)[]; // 1-based rank of each want id, null if absent
  firstHit: number | null;
  violations: { id: string; rank: number }[];
  ndcg: number;
  top: { id: string; name: string; score: number }[];
};

/** Graded gain: earlier entries in `want` are better answers. */
function gain(idx: number): number {
  return 1 / Math.log2(idx + 2); // want[0] → 1.0, want[1] → 0.63, …
}

function ndcgAt(c: GoldenCase, ordered: string[], k = TOP): number {
  let dcg = 0;
  for (let r = 0; r < Math.min(k, ordered.length); r++) {
    const idx = c.want.indexOf(ordered[r]);
    if (idx >= 0) dcg += gain(idx) / Math.log2(r + 2);
  }
  let ideal = 0;
  for (let i = 0; i < Math.min(k, c.want.length); i++) {
    ideal += gain(i) / Math.log2(i + 2);
  }
  return ideal === 0 ? 0 : dcg / ideal;
}

export function evaluate(pool: PoolFood[] = buildPool(), cases = GOLDEN): CaseResult[] {
  const prepared = prepare(pool);
  return cases.map((c) => {
    const res = searchPrepared(prepared, c.query, { limit: 400 });
    const ordered = res.map((r) => r.food.id);
    const ranks = c.want.map((id) => {
      const i = ordered.indexOf(id);
      return i < 0 ? null : i + 1;
    });
    const hits = ranks.filter((r): r is number => r !== null);
    const within = c.avoidWithin ?? TOP;
    const violations = (c.avoid ?? [])
      .map((id) => ({ id, rank: ordered.indexOf(id) + 1 }))
      .filter((v) => v.rank > 0 && v.rank <= within);
    return {
      c,
      ranks,
      firstHit: hits.length ? Math.min(...hits) : null,
      violations,
      ndcg: ndcgAt(c, ordered),
      top: res.slice(0, TOP).map((r) => ({ id: r.food.id, name: r.food.name, score: r.score })),
    };
  });
}

export type Summary = { mrr: number; ndcg: number; clean: number; top1: number; missing: number };

export function summarise(results: CaseResult[]): Summary {
  const n = results.length || 1;
  const mrr = results.reduce((s, r) => s + (r.firstHit ? 1 / r.firstHit : 0), 0) / n;
  const ndcg = results.reduce((s, r) => s + r.ndcg, 0) / n;
  const clean = results.filter((r) => r.violations.length === 0).length / n;
  const top1 = results.filter((r) => r.firstHit === 1).length / n;
  const missing = results.filter((r) => r.firstHit === null).length;
  return { mrr, ndcg, clean, top1, missing };
}

/** Golden-set ids that do not exist in the pool — a typo here silently makes a
 *  case unpassable, which looks like a ranking failure and isn't. */
export function unknownIds(pool: PoolFood[] = buildPool(), cases = GOLDEN): string[] {
  const have = new Set(pool.map((p) => p.id));
  const bad = new Set<string>();
  for (const c of cases) {
    for (const id of [...c.want, ...(c.avoid ?? [])]) if (!have.has(id)) bad.add(id);
  }
  return [...bad];
}

// ── CLI ────────────────────────────────────────────────────────────────────
const isMain = process.argv[1]?.includes("searchEval");
if (isMain) {
  const args = process.argv.slice(2);
  const showAll = args.includes("--all");
  const only = args.find((a) => !a.startsWith("-"));

  const pool = buildPool();
  console.log(`pool: ${pool.length} foods (${pool.filter((p) => p.source === "ingredient").length} staples + catalogue)`);

  const bad = unknownIds(pool);
  if (bad.length) {
    console.log(`\n⚠ ${bad.length} golden id(s) not in the pool — these cases can never pass:`);
    for (const id of bad) console.log(`    ${id}`);
  }

  const cases = only ? GOLDEN.filter((c) => c.query === only) : GOLDEN;
  if (!cases.length) {
    console.log(`no golden case for "${only}"`);
    process.exit(1);
  }
  const results = evaluate(pool, cases);

  for (const r of results) {
    const failed = r.firstHit === null || r.firstHit > 3 || r.violations.length > 0;
    if (!failed && !showAll && !only) continue;
    const mark = r.violations.length ? "✗" : r.firstHit === null ? "∅" : r.firstHit <= 3 ? "·" : "✗";
    console.log(`\n${mark} "${r.c.query}"   first=${r.firstHit ?? "MISSING"}  ndcg=${r.ndcg.toFixed(2)}`);
    console.log(`    want: ${r.c.want.map((id, i) => `${id}@${r.ranks[i] ?? "—"}`).join("  ")}`);
    if (r.violations.length) {
      console.log(`    AVOID HIT: ${r.violations.map((v) => `${v.id}@${v.rank}`).join("  ")}`);
    }
    if (showAll || only) {
      r.top.forEach((t, i) =>
        console.log(`      ${String(i + 1).padStart(2)}. ${t.score.toFixed(3)}  ${t.name}  [${t.id}]`)
      );
    }
    console.log(`    (${r.c.why})`);
  }

  const s = summarise(evaluate(pool, GOLDEN));
  console.log(
    `\n──────── ${GOLDEN.length} cases ────────\n` +
      `  MRR       ${s.mrr.toFixed(3)}\n` +
      `  NDCG@10   ${s.ndcg.toFixed(3)}\n` +
      `  Clean@10  ${(s.clean * 100).toFixed(0)}%   (no avoided id in the top 10)\n` +
      `  Top-1     ${(s.top1 * 100).toFixed(0)}%\n` +
      `  Missing   ${s.missing}`
  );
}
