import { test } from "node:test";
import assert from "node:assert/strict";
import { searchEquipment, getEquipment } from "./equipment.ts";

/** Convenience: names of the ranked results for a query. */
function names(q: string): string[] {
  return searchEquipment(q).map((e) => e.name);
}

test("empty query returns the full catalogue (page count depends on this)", () => {
  const all = searchEquipment("");
  assert.ok(all.length > 40);
});

test("Indonesian body-part words find the right machine", () => {
  // paha dalam = inner thigh
  assert.equal(names("paha dalam")[0], "Hip Adductor (Inner Thigh)");
  // paha luar = outer thigh
  assert.equal(names("paha luar")[0], "Hip Abductor (Outer Thigh)");
  // dada = chest — top hit is a chest machine
  assert.ok(/chest|pec/i.test(names("dada")[0] ?? ""));
  // punggung = back — a lat/row machine surfaces
  assert.ok(names("punggung").some((n) => /lat|row|pull/i.test(n)));
  // betis = calf (must NOT collapse into hamstrings)
  assert.ok(/calf/i.test(names("betis")[0] ?? ""));
  // bokong = glute
  assert.ok(names("bokong").some((n) => /glute|hip|kick/i.test(n)));
  // perut = abs
  assert.ok(names("perut").some((n) => /ab|crunch/i.test(n)));
});

test("English terms still work and rank sensibly", () => {
  assert.ok(/inner thigh/i.test(names("inner")[0] ?? ""));
  assert.ok(names("chest").length > 0);
  assert.ok(names("shoulder").some((n) => /delt|shoulder|press/i.test(n)));
});

test("common typos still resolve", () => {
  assert.ok(names("chst").some((n) => /chest|pec/i.test(n))); // chest
  assert.ok(names("sholder").some((n) => /delt|shoulder/i.test(n))); // shoulder
  assert.ok(names("tricep pushdow").some((n) => /tricep|pushdown/i.test(n)));
});

test("Chinese (hanzi) query matches", () => {
  assert.ok(searchEquipment("内弯").length > 0); // inner thigh machine hanzi
});

test("no match returns empty (not the whole list)", () => {
  assert.equal(searchEquipment("xyzzyqwerty").length, 0);
});

test("getEquipment resolves by id", () => {
  assert.equal(getEquipment("hip-adductor-machine")?.name, "Hip Adductor (Inner Thigh)");
});
