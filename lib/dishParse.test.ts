import test from "node:test";
import assert from "node:assert/strict";
import { buildDictionary, parseDish, normalizeDish } from "./dishParse.ts";

const CATALOGUE = [
  { id: "nasi-putih", name: "Nasi Putih" },
  { id: "nasi-goreng", name: "Nasi Goreng" },
  { id: "nasi-uduk", name: "Nasi Uduk" },
  { id: "ayam-goreng", name: "Ayam Goreng" },
  { id: "ayam-bakar", name: "Ayam Bakar" },
  { id: "ayam", name: "Ayam" },
  { id: "telur-ceplok", name: "Telur Ceplok" },
  { id: "telur", name: "Telur" },
  { id: "sambal", name: "Sambal" },
  { id: "sambal-matah", name: "Sambal Matah" },
  { id: "minyak-goreng", name: "Minyak Goreng" },
  { id: "ikan-bakar", name: "Ikan Kembung Bakar" },
  { id: "ikan", name: "Ikan" },
  { id: "gado-gado", name: "Gado-Gado" },
  { id: "kerupuk", name: "Kerupuk Udang" },
];
const dict = buildDictionary(CATALOGUE);
const ids = (q: string) => parseDish(q, dict).parts.map((p) => p.id);

test("normalizeDish folds case, punctuation and '+' into spaces", () => {
  assert.equal(normalizeDish("Nasi + Ayam Goreng"), "nasi ayam goreng");
  assert.equal(normalizeDish("Gado-Gado"), "gado gado");
});

test("a query that IS a known dish returns that dish, not its parts", () => {
  const r = parseDish("nasi goreng", dict);
  assert.equal(r.whole, true);
  assert.deepEqual(r.parts.map((p) => p.id), ["nasi-goreng"]);
  assert.equal(r.confidence, 1);
});

test("the composite wins over the ingredients it contains", () => {
  // "nasi" and "goreng" both exist as concepts, but the plate is one dish.
  assert.deepEqual(ids("nasi goreng"), ["nasi-goreng"]);
});

test("a plate of parts decomposes into those parts", () => {
  assert.deepEqual(ids("nasi putih ayam goreng sambal"), [
    "nasi-putih",
    "ayam-goreng",
    "sambal",
  ]);
});

test("the user's example: rice, fish, oil, chilli", () => {
  const r = parseDish("nasi putih ikan kembung bakar minyak goreng sambal", dict);
  assert.deepEqual(r.parts.map((p) => p.id), [
    "nasi-putih",
    "ikan-bakar",
    "minyak-goreng",
    "sambal",
  ]);
  assert.equal(r.whole, false);
  assert.ok(r.confidence > 0.6, `confidence ${r.confidence}`);
});

test("'+' between ingredients works, because that is how people type it", () => {
  assert.deepEqual(ids("nasi putih + ayam bakar + sambal matah"), [
    "nasi-putih",
    "ayam-bakar",
    "sambal-matah",
  ]);
});

test("longest match wins: 'sambal matah' is not 'sambal' plus junk", () => {
  assert.deepEqual(ids("sambal matah"), ["sambal-matah"]);
});

test("maximum matching does not strand a leading word", () => {
  // The dangerous case: 'ayam goreng' is longer than 'nasi', so a naive
  // longest-first over the whole string could take it and leave 'nasi' behind.
  const r = parseDish("nasi ayam goreng", dict);
  assert.deepEqual(r.parts.map((p) => p.id), ["nasi-putih", "ayam-goreng"]);
  assert.equal(r.unmatched.length, 0);
});

test("'tanpa X' excludes X instead of adding it", () => {
  const r = parseDish("nasi goreng tanpa telur", dict);
  assert.ok(!r.parts.some((p) => p.id.startsWith("telur")), JSON.stringify(r.parts));
  assert.ok(r.unmatched.includes("telur"));
});

test("quantities are not mistaken for foods", () => {
  const r = parseDish("2 telur ceplok", dict);
  assert.deepEqual(r.parts.map((p) => p.id), ["telur-ceplok"]);
});

test("filler words neither match nor count against coverage", () => {
  const r = parseDish("nasi putih dengan ayam bakar", dict);
  assert.deepEqual(r.parts.map((p) => p.id), ["nasi-putih", "ayam-bakar"]);
  assert.equal(r.unmatched.length, 0);
  assert.equal(r.confidence > 0.8, true);
});

test("unknown words are reported, not silently dropped", () => {
  const r = parseDish("nasi putih zzzz", dict);
  assert.deepEqual(r.parts.map((p) => p.id), ["nasi-putih"]);
  assert.deepEqual(r.unmatched, ["zzzz"]);
  assert.ok(r.confidence < 1);
});

test("confidence falls as the parse fragments", () => {
  const clean = parseDish("nasi goreng", dict).confidence;
  const many = parseDish("nasi putih ayam goreng telur ceplok sambal", dict).confidence;
  assert.ok(clean > many, `${clean} should exceed ${many}`);
});

test("an empty or junk query yields nothing rather than guessing", () => {
  assert.deepEqual(parseDish("", dict).parts, []);
  assert.deepEqual(parseDish("!!!", dict).parts, []);
  assert.equal(parseDish("zzz qqq", dict).parts.length, 0);
});

test("reduplication survives normalization", () => {
  assert.deepEqual(ids("gado gado"), ["gado-gado"]);
  assert.deepEqual(ids("Gado-Gado"), ["gado-gado"]);
});

test("parsing a real-sized dictionary stays instant", () => {
  const big = Array.from({ length: 2000 }, (_, i) => ({
    id: `f${i}`,
    name: `Makanan Nomor ${i} Spesial`,
  })).concat(CATALOGUE);
  const d = buildDictionary(big);
  const t0 = Date.now();
  for (let i = 0; i < 200; i++) parseDish("nasi putih ayam goreng sambal", d);
  const per = (Date.now() - t0) / 200;
  assert.ok(per < 5, `${per}ms per parse`);
});
