// Validation for the search-ranking helpers. No DB required.
//
//   node --experimental-strip-types --test scripts/foodRanking.test.ts

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseFoodCsv, type FoodRow } from "./foodCsv.ts";
import {
  buildSearchText,
  computePopularity,
  extractNameEn,
} from "./foodRanking.ts";

const DATA = join(process.cwd(), "data");
const lib = parseFoodCsv(readFileSync(join(DATA, "r2fit_library.csv"), "utf8"));
const byCode = (code: string): FoodRow => {
  const r = lib.find((x) => x.code === code);
  assert.ok(r, `row ${code} not found`);
  return r;
};

test("searchText folds in the English name from the note, drops machine suffix", () => {
  const roti = byCode("kb-bolo-bun"); // name_id "Bolo Bun / Roti Nanas Polos", en "Pineapple Bun"
  const st = buildSearchText(roti);
  assert.match(st, /bolo bun/);
  assert.match(st, /pineapple bun/); // English name reachable
  assert.doesNotMatch(st, /conf/); // "· conf:high ·" suffix stripped
  assert.doesNotMatch(st, /per100/);
  assert.doesNotMatch(st, /·/); // punctuation flattened
});

test("searchText is normalized (lowercase, no diacritics, single-spaced)", () => {
  const st = buildSearchText(byCode("kt-roti-bakar-srikaya-butter"));
  assert.equal(st, st.toLowerCase());
  assert.doesNotMatch(st, /\s{2,}/);
});

test("staple names get a popularity boost over obscure ones", () => {
  const nasi = computePopularity(byCode("cn-nasi-hainam"), "CUSTOM"); // "nasi" staple
  const gota = computePopularity(byCode("bp-saus-gota"), "CUSTOM"); // low-conf, no staple
  assert.ok(nasi > gota, `expected nasi(${nasi}) > gota(${gota})`);
});

test("low-confidence rows are penalized vs high-confidence", () => {
  const high = computePopularity(byCode("kt-roti-bakar-srikaya-butter"), "CUSTOM"); // conf:high
  const low = computePopularity(byCode("bp-saus-gota"), "CUSTOM"); // conf:low
  assert.ok(high > low);
});

test("extractNameEn pulls the English name from structured notes only", () => {
  // R2FIT row: note is "<English> · <serving> · conf:… · …"
  assert.equal(
    extractNameEn(byCode("kb-bolo-bun")),
    "Pineapple Bun (plain)"
  );
  assert.equal(
    extractNameEn(byCode("kt-roti-bakar-srikaya-butter")),
    "Kaya Butter Toast"
  );
});

test("extractNameEn returns null for unstructured (dessert/TKPI) notes", () => {
  const fake = {
    code: "X",
    name: "Bolu",
    nameNormalized: "bolu",
    state: "Olahan",
    foodGroup: "Kue/Dessert",
    bddPct: 100,
    portionGCooked: null,
    note: "Estimasi per 100g: tepung, telur, gula.",
    nutrients: {},
  } as unknown as FoodRow;
  assert.equal(extractNameEn(fake), null);
});

test("popularity is never negative", () => {
  for (const r of lib) {
    assert.ok(computePopularity(r, "CUSTOM") >= 0, `${r.code} went negative`);
  }
});
