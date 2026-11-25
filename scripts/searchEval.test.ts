// Ranking quality as a test, so it can't silently regress.
//
//   node --experimental-strip-types --test scripts/searchEval.test.ts
//
// The floors below are RATCHETS, not targets. They record the quality that was
// actually shipped; when a change improves a metric, raise the floor in the
// same commit. When one drops, the test fails and you find out from CI instead
// of from a user typing "telur".

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { prepare, searchPrepared } from "../lib/foodSearch.ts";
import { buildPool, catalogueFiles, sourceFor } from "./searchPool.ts";
import { evaluate, summarise, unknownIds } from "./searchEval.ts";
import { GOLDEN } from "./searchGolden.ts";

// Measured on the commit that introduced this file. Raise, never lower.
const FLOOR = {
  mrr: 0.81,
  ndcg: 0.67,
  clean: 0.94,
  top1: 0.75,
};

const pool = buildPool();

test("the pool is the one the app actually searches", () => {
  // Staples + catalogue. If either half vanishes the metrics below become
  // meaningless while still looking fine.
  assert.ok(pool.length > 4000, `pool too small: ${pool.length}`);
  const staples = pool.filter((p) => p.source === "ingredient");
  assert.ok(staples.length > 100, `staples missing: ${staples.length}`);
  assert.ok(pool.some((p) => p.id === "egg"), "Whole egg must be searchable");
});

test("every CSV pack has a declared seed source", () => {
  // sourceFor() falls back to CUSTOM, which is right for most packs but wrong
  // for TKPI and USDA — a new pack of either kind would score subtly wrong.
  const known = new Set(["TKPI", "USDA", "CUSTOM"]);
  for (const f of catalogueFiles()) {
    assert.ok(known.has(sourceFor(f)), `${f} has no source mapping`);
  }
  // Catch a pack added to data/ that seed-foods.ts also needs to learn about.
  const onDisk = readdirSync(join(process.cwd(), "data")).filter((n) => n.endsWith(".csv"));
  assert.equal(onDisk.length, catalogueFiles().length);
});

test("every golden id exists in the pool", () => {
  // A typo'd id makes a case permanently unpassable, which reads as a ranking
  // failure and is really a test bug. This is the guard for that.
  assert.deepEqual(unknownIds(pool), []);
});

test("ranking quality does not regress", () => {
  const s = summarise(evaluate(pool, GOLDEN));
  const report =
    `MRR ${s.mrr.toFixed(3)} · NDCG@10 ${s.ndcg.toFixed(3)} · ` +
    `Clean@10 ${s.clean.toFixed(3)} · Top-1 ${s.top1.toFixed(3)} · missing ${s.missing}`;
  assert.ok(s.mrr >= FLOOR.mrr, `MRR regressed — ${report}`);
  assert.ok(s.ndcg >= FLOOR.ndcg, `NDCG regressed — ${report}`);
  assert.ok(s.clean >= FLOOR.clean, `Clean@10 regressed — ${report}`);
  assert.ok(s.top1 >= FLOOR.top1, `Top-1 regressed — ${report}`);
});

test("every golden query returns something", () => {
  // Recall failures are worse than ranking failures: the user concludes the
  // food isn't in the app at all.
  for (const r of evaluate(pool, GOLDEN)) {
    assert.notEqual(r.firstHit, null, `"${r.c.query}" returned none of ${r.c.want.join(", ")}`);
  }
});

test("search stays fast enough to run per keystroke", () => {
  // The whole design rests on ranking client-side on every keystroke. If this
  // budget breaks, the architecture has to change, not the constants.
  const prepared = prepare(pool);
  const queries = GOLDEN.map((g) => g.query);
  const start = performance.now();
  for (let i = 0; i < 5; i++) for (const q of queries) searchPrepared(prepared, q, { limit: 400 });
  const per = (performance.now() - start) / (5 * queries.length);
  // Tightened from 40ms after the letter-mask prefilter roughly halved the
  // fuzzy tier: "telur" went 24.6ms → 13.1ms, "ayam" 22.2 → 9.8. Node on this
  // box is slower than a phone's JIT on a warm path, so this is a ceiling, not
  // a target.
  assert.ok(per < 20, `search took ${per.toFixed(1)}ms per query (budget 20ms in CI)`);
});

test("pork queries surface everyday pork cuts and dishes immediately", () => {
  const prepared = prepare(pool);
  const topIds = (q: string, n = 8) =>
    searchPrepared(prepared, q, { limit: n }).map((r) => r.food.id);

  assert.ok(topIds("daging babi", 5).includes("day-daging-babi"));
  assert.ok(!topIds("daging babi", 5).includes("KR003")); // not lard
  assert.ok(topIds("babi", 5).includes("day-babi"));
  assert.ok(topIds("babi", 8).some((id) => id.includes("babi")));
  assert.ok(topIds("pork", 8).some((id) => id.includes("babi") || id.includes("pork")));
  assert.ok(topIds("pork", 10).includes("day-babi") || topIds("pork", 10).includes("day-daging-babi"));
  assert.ok(topIds("samcan", 6).some((id) => id.includes("samcan")));
  assert.ok(topIds("has dalam", 6).some((id) => id.includes("has-dalam")));
  assert.ok(topIds("babi cincang", 6).some((id) => id.includes("cincang")));
  assert.ok(topIds("bakut", 5).some((id) => id.includes("bakut")));
});

test("mega deep everyday pack loads all 354 foods and ranks everyday ID/EN/Pinyin/CJK queries", () => {
  const dfrFoods = pool.filter((p) => p.id.startsWith("dfr-"));
  assert.equal(dfrFoods.length, 354);

  const prepared = prepare(pool);
  const top = (q: string, n = 8) => searchPrepared(prepared, q, { limit: n }).map((r) => r.food);
  const topIds = (q: string, n = 8) => top(q, n).map((f) => f.id);

  assert.ok(topIds("fanqie chao dan", 5).some((id) => id.includes("fanqie-chaodan")));
  assert.ok(topIds("番茄炒蛋", 5).some((id) => id.includes("fanqie-chaodan")));
  assert.ok(topIds("malatang", 5).some((id) => id.includes("malatang")));
  assert.ok(topIds("麻辣烫", 5).some((id) => id.includes("malatang")));
  assert.ok(topIds("matcha", 6).some((id) => id.includes("matcha")));
  assert.ok(topIds("kopi susu", 6).some((r) => {
    const f = r.toLowerCase();
    return f.includes("kopi") || f.includes("latte") || f.includes("luckin");
  }));
  assert.ok(top("dada ayam", 5).some((f) => f.name.toLowerCase().includes("dada ayam")));
  assert.ok(top("telur", 5).some((f) => f.name.toLowerCase().includes("telur")));
  assert.ok(top("nasi putih", 5).some((f) => f.name.toLowerCase().includes("nasi")));
  assert.ok(top("mie", 8).some((f) => {
    const n = f.name.toLowerCase();
    return n.includes("mie") || n.includes("bakmi") || n.includes("mi ");
  }));
});
