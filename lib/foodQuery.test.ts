import { test } from "node:test";
import assert from "node:assert/strict";
import {
  foodState,
  groupResults,
  parseFoodQuery,
  relaxQuery,
} from "./foodQuery.ts";

test("a cooking method the catalogue does not name is taken out of the words", () => {
  assert.deepEqual(parseFoodQuery("ayam air fryer"), {
    text: "ayam",
    method: "airfry",
    wantsRaw: false,
  });
  assert.deepEqual(parseFoodQuery("Dada ayam di AirFryer"), {
    text: "dada ayam",
    method: "airfry",
    wantsRaw: false,
  });
  assert.equal(parseFoodQuery("salmon oven").text, "salmon");
  assert.equal(parseFoodQuery("salmon oven").method, "panggang");
  assert.equal(parseFoodQuery("dada ayam grill").method, "panggang");
});

test("words that are part of dish names stay in the search", () => {
  assert.deepEqual(parseFoodQuery("ayam goreng"), {
    text: "ayam goreng",
    method: null,
    wantsRaw: false,
  });
  // "air" alone is water, not an air fryer.
  assert.deepEqual(parseFoodQuery("air kelapa"), {
    text: "air kelapa",
    method: null,
    wantsRaw: false,
  });
});

test("'mentah' asks for raw ingredients", () => {
  assert.deepEqual(parseFoodQuery("ayam mentah"), {
    text: "ayam",
    method: null,
    wantsRaw: true,
  });
  assert.equal(parseFoodQuery("raw chicken").wantsRaw, true);
});

test("a query that finds nothing relaxes from the end, never to nothing", () => {
  const has = (q: string) => q === "ayam" || q === "ayam bakar";
  assert.equal(relaxQuery("ayam bakar madu", has), "ayam bakar");
  assert.equal(relaxQuery("ayam kremes spesial", has), "ayam");
  assert.equal(relaxQuery("ayam", has), "ayam");
  assert.equal(relaxQuery("xyz abc", has), null);
});

test("raw or cooked is read from the food itself", () => {
  assert.equal(foodState({ name: "Ayam giling (minced chicken), mentah" }), "mentah");
  assert.equal(foodState({ name: "Beef (rendang cut, raw)" }), "mentah");
  assert.equal(foodState({ name: "Chicken mince", unit: "100g (cooked)" }), "matang");
  assert.equal(foodState({ name: "Ayam goreng" }), "matang");
  assert.equal(foodState({ name: "Ayam Rica-Rica" }), "matang");
  assert.equal(foodState({ name: "Chicken breast", state: "mentah" }), "mentah");
  assert.equal(foodState({ name: "Ayam" }), null);
  assert.equal(foodState({ name: "Dada ayam fillet" }), null);
});

type F = { id: string; name: string; aliases?: string; state?: "mentah" | "matang" };
const pool: F[] = [
  { id: "ayam", name: "Ayam" },
  { id: "breast", name: "Chicken breast", aliases: "ayam dada dada ayam", state: "mentah" },
  { id: "goreng", name: "Ayam goreng" },
  { id: "bakar", name: "Ayam bakar" },
  { id: "bakar2", name: "Ayam Bakar" },
  { id: "mie", name: "Mie ayam" },
  { id: "egg", name: "Whole egg", aliases: "telur telor telur ayam" },
  { id: "soto", name: "Soto ayam" },
  { id: "giling", name: "Ayam giling, mentah" },
];

test("results group by what the word means: the food, its dishes, dishes with it", () => {
  const g = groupResults(pool, "ayam")!;
  assert.deepEqual(
    g.map((x) => [x.key, x.title, x.items.map((i) => i.id)]),
    [
      ["bahan", "Bahan ayam", ["ayam", "breast", "giling"]],
      ["masakan", "Masakan ayam", ["goreng", "bakar"]],
      ["mengandung", "Mengandung ayam", ["mie", "egg", "soto"]],
    ],
  );
});

test("what he picks often leads, and is not listed twice", () => {
  const aff = (id: string) => (id === "goreng" ? 0.6 : id === "mie" ? 0.3 : 0);
  const g = groupResults(pool, "ayam", { affinity: aff })!;
  assert.equal(g[0].key, "personal");
  assert.equal(g[0].title, "Sering kamu pilih");
  assert.deepEqual(g[0].items.map((i) => i.id), ["goreng", "mie"]);
  assert.ok(!g.find((x) => x.key === "masakan")!.items.some((i) => i.id === "goreng"));
});

test("asking for raw puts ingredients first; long queries stay one list", () => {
  const raw = groupResults(pool, "ayam", { preferRaw: true })!;
  assert.equal(raw[0].key, "bahan");
  assert.equal(groupResults(pool, "ayam bakar"), null);
  assert.equal(groupResults(pool.slice(0, 3), "ayam"), null);
});

test("cuts are the food, named dishes are its dishes, the rest contain it", () => {
  const more: F[] = [
    { id: "a", name: "Ayam" },
    { id: "daging", name: "Daging Ayam" },
    { id: "dada", name: "Dada ayam fillet" },
    { id: "koloke", name: "Ayam Koloke" },
    { id: "kungpao", name: "Ayam Kung Pao" },
    { id: "rebus", name: "Dada Ayam Rebus" },
    { id: "opor", name: "Opor Ayam" },
    { id: "gulai", name: "Gulai Ayam" },
    { id: "mie", name: "Mie ayam" },
    { id: "egg", name: "Telur ayam" },
  ];
  const g = groupResults(more, "ayam")!;
  const of = (k: string) => g.find((x) => x.key === k)!.items.map((i) => i.id);
  assert.deepEqual(of("bahan"), ["a", "daging", "dada"]);
  assert.deepEqual(of("masakan"), ["koloke", "kungpao", "rebus", "opor", "gulai"]);
  assert.deepEqual(of("mengandung"), ["mie", "egg"]);
});

test("English-named staples group by their Indonesian name", () => {
  const rice: F[] = [
    { id: "nasi", name: "Nasi" },
    { id: "white", name: "White rice", aliases: "nasi putih nasi beras" },
    { id: "uduk", name: "Nasi uduk" },
    { id: "goreng", name: "Nasi goreng" },
    { id: "bubur", name: "Bubur nasi" },
    { id: "kupat", name: "Kupat tahu" },
  ];
  const g = groupResults(rice, "nasi")!;
  assert.deepEqual(g.find((x) => x.key === "bahan")!.items.map((i) => i.id), ["nasi", "white"]);
  assert.deepEqual(g.find((x) => x.key === "masakan")!.items.map((i) => i.id), ["uduk", "goreng"]);
});
