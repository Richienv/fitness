import test from "node:test";
import assert from "node:assert/strict";
import { coerceServerItems } from "./mealRecords.ts";
test("server meal import preserves volume portions and absent sugar across devices", () => {
  const [item] = coerceServerItems([
    {
      custom: true,
      name: "Susu",
      grams: 0,
      portionLabel: "1 × 200 ml",
      kcal: 80,
      protein: 4,
      carbs: 10,
      fat: 2,
    },
  ]);
  assert.equal("portionLabel" in item ? item.portionLabel : null, "1 × 200 ml");
  assert.equal("sugar" in item, false);
});
test("server meal import retains documented zero sugar without accepting invalid optional data", () => {
  const items = coerceServerItems([
    {
      custom: true,
      name: "Teh",
      grams: 0,
      kcal: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      sugar: 0,
      sodium: NaN,
    },
  ]);
  assert.equal("sugar" in items[0] ? items[0].sugar : null, 0);
  assert.equal("sodium" in items[0], false);
});
test("label nutrition survives server reload including declared zero trans fat", () => {
  const [item] = coerceServerItems([
    {
      custom: true,
      name: "Label test",
      grams: 30,
      kcal: 159.75,
      protein: 2.46,
      carbs: 18.18,
      fat: 8.58,
      sugar: 5.4,
      sodium: 75.3,
      saturatedFat: 4.8,
      transFat: 0,
      salt: 0.18825,
      fiber: NaN,
    },
  ]);
  assert.deepEqual(
    Object.fromEntries(
      ["sugar", "sodium", "saturatedFat", "transFat", "salt"].map((k) => [
        k,
        (item as unknown as Record<string, unknown>)[k],
      ]),
    ),
    { sugar: 5.4, sodium: 75.3, saturatedFat: 4.8, transFat: 0, salt: 0.18825 },
  );
  assert.equal("fiber" in item, false);
});
