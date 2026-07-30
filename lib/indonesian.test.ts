import test from "node:test";
import assert from "node:assert/strict";
import { affixVariants, collapseReduplication, indonesianAliases } from "./indonesian.ts";

test("passive di- is stripped: digoreng is goreng", () => {
  assert.ok(affixVariants("digoreng").includes("goreng"));
  assert.ok(affixVariants("dibakar").includes("bakar"));
});

test("the -nya clitic is stripped", () => {
  assert.ok(affixVariants("ayamnya").includes("ayam"));
});

test("short words are left alone — there is no affix to find", () => {
  assert.deepEqual(affixVariants("ayam"), []);
  assert.deepEqual(affixVariants("es"), []);
  assert.deepEqual(affixVariants("nasi"), []);
});

test("stripping never leaves a stub", () => {
  // "diet" starts with "di" but "et" is not a word — the 4-char floor stops it.
  assert.ok(!affixVariants("diet").includes("et"));
  for (const v of affixVariants("dimsum")) assert.ok(v.length >= 4, v);
});

test("-an is NOT stripped, because the suffix is often the dish", () => {
  // gorengan (fritters) is a different food from goreng (fried). Over-stemming
  // a two-word document destroys the only signal it has.
  assert.ok(!affixVariants("gorengan").includes("goreng"));
  assert.ok(!affixVariants("makanan").includes("makan"));
});

test("adjacent reduplication collapses to one term", () => {
  assert.deepEqual(collapseReduplication(["gado", "gado"]), ["gado"]);
  assert.deepEqual(collapseReduplication(["cumi", "cumi", "goreng"]), ["cumi", "goreng"]);
});

test("a non-repeated pair is untouched", () => {
  assert.deepEqual(collapseReduplication(["nasi", "goreng"]), ["nasi", "goreng"]);
  assert.deepEqual(collapseReduplication(["ayam", "bakar", "ayam"]), ["ayam", "bakar", "ayam"]);
});

test("spelling variants that edit distance cannot reach", () => {
  // 4-letter words get a typo budget of 1, and these differ by more or by length.
  assert.ok(indonesianAliases("cabe").includes("cabai"));
  assert.ok(indonesianAliases("trasi").includes("terasi"));
  assert.ok(indonesianAliases("toge").includes("tauge"));
  assert.ok(indonesianAliases("telor").includes("telur"));
});

test("English maps to Indonesian and back", () => {
  assert.ok(indonesianAliases("chicken").includes("ayam"));
  assert.ok(indonesianAliases("ayam").includes("chicken"));
  assert.ok(indonesianAliases("fried").includes("goreng"));
  assert.ok(indonesianAliases("rice").includes("nasi"));
});

test("affix stripping composes with the alias table", () => {
  // digoreng -> goreng -> fried, in one lookup.
  assert.ok(indonesianAliases("digoreng").includes("goreng"));
  assert.ok(indonesianAliases("digoreng").includes("fried"));
});

test("a token is never its own alias", () => {
  for (const t of ["ayam", "goreng", "digoreng", "cabe", "nasi"]) {
    assert.ok(!indonesianAliases(t).includes(t), t);
  }
});

test("an unknown word expands to nothing rather than guessing", () => {
  assert.deepEqual(indonesianAliases("zzzz"), []);
});
