import test from "node:test";
import assert from "node:assert/strict";
import { templateKcal, type MealTemplate } from "./mealTemplates.ts";

test("old saved menus stay compatible and new menus retain flat add-on calories", () => {
  const menu: MealTemplate = { id: "test", name: "Lunch", emoji: "", createdAt: 1, items: [{ id: "rice", name: "Rice", qty: 2, unit: "100 g", kcal: 130, protein: 3, carbs: 28, fat: 0 }] };
  assert.equal(templateKcal(menu), 260);
  menu.items[0].mods = ["sambal"];
  assert.equal(templateKcal(menu), 295);
});
