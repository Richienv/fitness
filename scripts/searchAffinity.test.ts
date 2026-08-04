// Does behaviour actually reorder the list, and only as far as it should?
//
//   node --experimental-strip-types --test scripts/searchAffinity.test.ts
//
// The complaint being tested, verbatim: "telor balado is still showing even
// though the user never pick it". These assertions are that sentence, made
// executable — plus the assertions that stop the fix going too far, because a
// personalisation feature that buries correct answers under familiar ones is
// the same bug wearing different clothes.

import { test } from "node:test";
import assert from "node:assert/strict";
import { prepare, searchPrepared } from "../lib/foodSearch.ts";
import { makeScorer, type AffinityStore } from "../lib/foodAffinity.ts";
import { buildPool } from "./searchPool.ts";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 7, 4, 8, 0, 0); // a Tuesday, breakfast time

const pool = buildPool();
const prepared = prepare(pool);

/** Someone six months into using the app: eggs fried, never balado. */
function history(): AffinityStore {
  const daily = (n: number, lastDaysAgo: number, slot: 0 | 1 | 2 | 3) => ({
    nf: n,
    ns: n,
    sl: [0, 0, 0, 0].map((_, i) => (i === slot ? n : 0)) as [number, number, number, number],
    last: NOW - lastDaysAgo * DAY,
  });
  return {
    foods: {
      "white-rice": daily(40, 0, 1),
      "stp-telur-goreng": daily(25, 0, 0),
      "chicken-breast": daily(20, 1, 1),
      kopi: daily(15, 0, 0),
      banana: daily(8, 2, 3),
      // Tapped exactly once, three months ago. This is the food in the complaint.
      "telur-balado": { nf: 1, ns: 1, sl: [0, 0, 1, 0], last: NOW - 90 * DAY },
    },
    pairs: { "stp-telur-goreng|white-rice": 18 },
  };
}

const rank = (q: string, aff?: (id: string) => number) =>
  searchPrepared(prepared, q, { limit: 400, affinity: aff }).map((r) => r.food.id);

const at = (ids: string[], id: string) => {
  const i = ids.indexOf(id);
  return i < 0 ? Infinity : i + 1;
};

const scorer = () => makeScorer(history(), { now: NOW, slot: 0, plate: ["white-rice"] });

test("a food you eat outranks one you tapped once, three months ago", () => {
  const before = rank("telur");
  const after = rank("telur", scorer());

  const gorengBefore = at(before, "stp-telur-goreng");
  const gorengAfter = at(after, "stp-telur-goreng");
  const baladoBefore = at(before, "telur-balado");
  const baladoAfter = at(after, "telur-balado");

  assert.ok(
    gorengAfter < gorengBefore || gorengAfter <= 3,
    `telur goreng should rise: ${gorengBefore} → ${gorengAfter}`
  );
  assert.ok(
    gorengAfter < baladoAfter,
    `telur goreng (25 logs) must beat telur balado (1, 90d ago): ${gorengAfter} vs ${baladoAfter}`
  );
  assert.ok(
    baladoAfter >= baladoBefore,
    `telur balado must not rise: ${baladoBefore} → ${baladoAfter}`
  );
});

test("affinity never displaces an exact name match", () => {
  // The load-bearing guarantee. A cap alone cannot promise this — enough
  // affinity on a near-tie still flips the order — so the exact-name match is
  // a primary sort key and affinity only orders what is left.
  for (const q of ["telur", "nasi", "ayam", "kopi"]) {
    const res = searchPrepared(prepared, q, { limit: 20, affinity: scorer() });
    const top = res[0];
    const anyExact = res.some((r) => r.exact);
    if (anyExact) {
      assert.ok(top.exact, `"${q}" put a non-exact result above an exact one: ${top.food.name}`);
    }
  }
});

test("a food you have never logged is not punished", () => {
  // The asymmetry that prevents a filter bubble. Unknown foods score 0 and are
  // simply not lifted; if they were pushed DOWN, nothing new could be found.
  const aff = scorer();
  const unknown = rank("rendang", aff);
  const plain = rank("rendang");
  assert.equal(unknown[0], plain[0], "an unrelated query must be unchanged by history");
});

test("a brand-new user sees exactly the unpersonalised list", () => {
  const empty = makeScorer({ foods: {}, pairs: {} }, { now: NOW });
  for (const q of ["telur", "ayam", "nasi goreng"]) {
    assert.deepEqual(rank(q, empty), rank(q), `cold start changed "${q}"`);
  }
});

test("the boost is bounded, so relevance still leads", () => {
  // 0.4 max. A favourite can reorder near-ties; it cannot rescue a bad match.
  const aff = scorer();
  for (const id of Object.keys(history().foods)) {
    const a = aff(id);
    assert.ok(a >= 0 && a <= 1, `${id} affinity out of range: ${a}`);
  }
  // Something logged 40 times should be a strong but not saturated signal.
  assert.ok(aff("white-rice") > 0.4, `heavy use should score high: ${aff("white-rice")}`);
  assert.ok(aff("telur-balado") < 0.1, `one tap 90d ago should be faint: ${aff("telur-balado")}`);
});

test("two half-lives distinguish 'stopped' from 'occasional'", () => {
  // Hold total history EQUAL and vary only the gap, or the test proves nothing:
  // my first attempt gave the abandoned food a bigger slow counter and then
  // acted surprised when it won, which it deserved to.
  //
  // Both foods below have the same 10 lifetime logs. One is eaten monthly and
  // was eaten 25 days ago; the other was a daily habit that stopped 60 days
  // ago. Under the single 21-day decay this replaced, the monthly food read as
  // abandoned (2^(-30/21) = 0.37 per gap). It should now read as alive.
  const equalHistory = (lastDaysAgo: number): AffinityStore => ({
    foods: {
      f: { nf: 10, ns: 10, sl: [0, 5, 5, 0], last: NOW - lastDaysAgo * DAY },
    },
    pairs: {},
  });
  const current = makeScorer(equalHistory(25), { now: NOW, slot: 1 })("f");
  const lapsed = makeScorer(equalHistory(60), { now: NOW, slot: 1 })("f");
  const gone = makeScorer(equalHistory(240), { now: NOW, slot: 1 })("f");

  assert.ok(current > lapsed, `25d should beat 60d: ${current} vs ${lapsed}`);
  assert.ok(lapsed > gone, `60d should beat 240d: ${lapsed} vs ${gone}`);
  // The point of H_SLOW, stated as the thing it actually buys. At 60 days the
  // fast counter is spent — 10 * 2^-6 = 0.16, i.e. 1.6% of its peak — so a
  // fast-only score would be ~0.017 and the habit would read as erased. The
  // slow term carries it to 0.10, six times higher. Assert the ratio the two
  // half-lives produce rather than an invented threshold: my first version of
  // this test asserted `lapsed > current * 0.5` for no reason beyond it
  // sounding right, and 53% decay over an extra 35 days is perfectly sane.
  const fastOnlyLapsed = 0.68 * (10 * 2 ** -6) / ((10 * 2 ** -6) + 6) * 0.73;
  assert.ok(
    lapsed > fastOnlyLapsed * 3,
    `the slow counter should carry a lapsed habit: ${lapsed} vs fast-only ${fastOnlyLapsed}`
  );
  // Eight months, though, really is gone.
  assert.ok(gone < current * 0.5, `240 days should genuinely decay: ${gone} vs ${current}`);
});

test("meal slot shades the score without dominating it", () => {
  const breakfast = makeScorer(history(), { now: NOW, slot: 0 })("kopi");
  const dinner = makeScorer(history(), { now: NOW, slot: 2 })("kopi");
  assert.ok(breakfast > dinner, "coffee logged every morning should rank higher at breakfast");
  // W_SLOT is 0.18 of the affinity, which is itself capped at 0.4 — so slot is
  // worth at most ~7%. It must not be able to flip a real relevance gap.
  assert.ok(breakfast - dinner < 0.2, `slot swing too large: ${breakfast - dinner}`);
});
