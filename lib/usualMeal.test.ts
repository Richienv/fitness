import { test } from "node:test";
import assert from "node:assert/strict";
import { usualMeal, type SlotMeal } from "./usualMeal.ts";

const TODAY = "2026-11-21";
const day = (n: number) =>
  new Date(Date.parse(TODAY + "T12:00:00Z") + n * 86400000)
    .toISOString()
    .slice(0, 10);
type Item = { key: string; qty: number };
const key = (i: Item) => i.key;
const meal = (
  date: string,
  items: Item[],
  mealType: SlotMeal<Item>["mealType"] = "breakfast",
): SlotMeal<Item> => ({ date, mealType, items });
const oat = (qty = 1) => ({ key: "oat", qty });
const whey = (qty = 1) => ({ key: "whey", qty });

test("the same foods in this slot on 3+ days in 4 weeks are the usual meal", () => {
  const u = usualMeal(
    [
      meal(day(-9), [oat(), whey()]),
      meal(day(-5), [whey(), oat()]), // order does not matter
      meal(day(-2), [oat(1.5), whey()]),
      meal(day(-3), [{ key: "roti", qty: 2 }]),
    ],
    "breakfast",
    TODAY,
    key,
  );
  assert.ok(u);
  assert.equal(u.days, 3);
  assert.equal(u.lastDate, day(-2));
  // Portions come from the most recent time he ate it.
  assert.deepEqual(u.items, [oat(1.5), whey()]);
});

test("two days is not a habit yet", () => {
  const u = usualMeal(
    [meal(day(-4), [oat()]), meal(day(-1), [oat()])],
    "breakfast",
    TODAY,
    key,
  );
  assert.equal(u, null);
});

test("only this slot, only the last 28 days, never today", () => {
  const u = usualMeal(
    [
      meal(day(-30), [oat()]),
      meal(day(-29), [oat()]),
      meal(day(-3), [oat()]),
      meal(TODAY, [oat()]),
      meal(day(-2), [oat()], "dinner"),
      meal(day(-1), [oat()], "dinner"),
    ],
    "breakfast",
    TODAY,
    key,
  );
  assert.equal(u, null);
});

test("rows for the same day and slot count as one meal", () => {
  const u = usualMeal(
    [
      meal(day(-6), [oat()]),
      meal(day(-6), [whey()]),
      meal(day(-4), [oat(), whey()]),
      meal(day(-1), [oat()]),
      meal(day(-1), [whey()]),
    ],
    "breakfast",
    TODAY,
    key,
  );
  assert.ok(u);
  assert.equal(u.days, 3);
  assert.deepEqual(u.items.map((i) => i.key), ["oat", "whey"]);
});

test("the most frequent meal wins; a tie goes to the most recent", () => {
  const nasi = { key: "nasi", qty: 1 };
  const ayam = { key: "ayam", qty: 1 };
  const meals = [
    meal(day(-10), [oat()]),
    meal(day(-8), [oat()]),
    meal(day(-6), [oat()]),
    meal(day(-9), [nasi, ayam]),
    meal(day(-7), [nasi, ayam]),
    meal(day(-1), [nasi, ayam]),
  ];
  assert.deepEqual(
    usualMeal(meals, "breakfast", TODAY, key)!.items.map((i) => i.key),
    ["nasi", "ayam"],
  );
  const more = [...meals, meal(day(-4), [oat()])];
  assert.deepEqual(
    usualMeal(more, "breakfast", TODAY, key)!.items.map((i) => i.key),
    ["oat"],
  );
});

test("empty meals are ignored", () => {
  const u = usualMeal(
    [meal(day(-3), []), meal(day(-2), []), meal(day(-1), [])],
    "breakfast",
    TODAY,
    key,
  );
  assert.equal(u, null);
});
