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
