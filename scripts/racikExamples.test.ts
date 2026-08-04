// Every example plate on the RACIK screen must actually produce a RACIK card.
//
//   node --experimental-strip-types --test scripts/racikExamples.test.ts
//
// The gate below is copied from the `racik` memo in app/meal/FoodBuilder.tsx.
// If that gate changes, this test must change with it — which is the point:
// the examples and the thing they demonstrate cannot drift apart silently.

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDictionary, parseDish } from "../lib/dishParse.ts";
import { RACIK_EXAMPLES } from "../lib/racikExamples.ts";
import { buildPool } from "./searchPool.ts";

const pool = buildPool();
const byId = new Map(pool.map((f) => [f.id, f]));
const dict = buildDictionary(pool.map((f) => ({ id: f.id, name: f.name })));

/** FoodBuilder's condition for rendering the RACIK card, verbatim. */
function racikCard(query: string) {
  if (!query || query.trim().length < 4) return null;
  const r = parseDish(query, dict);
  if (r.whole || r.parts.length < 2 || r.confidence < 0.6) return null;
  const foods = r.parts.map((p) => byId.get(p.id)).filter(Boolean);
  if (foods.length < 2) return null;
  return { foods, confidence: r.confidence };
}

test("every RACIK example produces a card", () => {
  for (const ex of RACIK_EXAMPLES) {
    const card = racikCard(ex);
    assert.ok(card, `"${ex}" shows no RACIK card — it would teach the user the feature is broken`);
    assert.ok(
      card.foods.length >= 2,
      `"${ex}" resolved to ${card.foods.length} part(s); an example must show a plate coming apart`
    );
  }
});

test("every RACIK example resolves to real, named foods", () => {
  for (const ex of RACIK_EXAMPLES) {
    const card = racikCard(ex);
    assert.ok(card);
    for (const f of card.foods) {
      assert.ok(f && f.name && f.name.length > 1, `"${ex}" produced a nameless part`);
    }
  }
});

test("a plate the catalogue has as one row is NOT split", () => {
  // "mie cakalang" is a real single food here, so the parser should decline —
  // splitting it would invent a worse answer than the row that already exists.
  // This is the counter-case that keeps the confidence gate honest.
  assert.equal(racikCard("mie cakalang"), null, "a known single dish must not be split");
});

test("a low-confidence parse is rejected rather than guessed at", () => {
  // The example this test exists to have caught: 0.56 confidence, and it reads
  // "kuning" (as in mie kuning, yellow noodles) as "Kuning Telur Rebus" — egg
  // yolk. Better to show nothing than to show that.
  assert.equal(
    racikCard("mie kuning ikan cakalang sambal"),
    null,
    "a parse under the confidence gate must not produce a card"
  );
});
