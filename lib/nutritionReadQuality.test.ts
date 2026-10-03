import { test } from "node:test";
import assert from "node:assert/strict";
import { parseNutritionLabel } from "./nutritionLabel.ts";
import {
  bestNutritionPrediction,
  labelNeedsRescue,
  type VariantPrediction,
} from "./nutritionReadQuality.ts";
const text =
  "每100克\n能量 500千焦\n蛋白质 4克\n脂肪 4克\n碳水化合物 15克\n糖 5克";
function read(
  source = text,
  confidence = 90,
  method: VariantPrediction["method"] = "original",
): VariantPrediction {
  return {
    label: parseNutritionLabel(source),
    confidence,
    method,
    elapsedMs: 1000,
    preprocessMs: 20,
  };
}
test("more confident but missing rows does not replace a complete reading", () => {
  const a = read(),
    b = read("每100克\n蛋白质 4克", 99, "threshold");
  assert.equal(bestNutritionPrediction([a, b]).winner, a);
});
test("impossible macro amounts lose despite higher confidence", () => {
  const a = read(),
    b = read(text.replace("糖 5克", "糖 50克"), 99, "contrast");
  assert.equal(bestNutritionPrediction([a, b]).winner, a);
});
test("equal quality keeps the original", () => {
  const a = read(),
    b = read(text, 90, "grayscale");
  assert.equal(bestNutritionPrediction([a, b]).winner, a);
});
test("plausible stronger reading wins without blending nutrient values", () => {
  const a = read(),
    b = read(text.replace("蛋白质 4克", "蛋白质 5克"), 97, "contrast");
  const result = bestNutritionPrediction([a, b]);
  assert.equal(result.winner, b);
  assert.equal(result.label.values.protein, 5);
  assert.deepEqual(result.conflicts, ["protein"]);
  assert.ok(result.label.warnings.some((w) => w.includes("antar versi")));
});
test("differing reference units are explicitly flagged", () => {
  const result = bestNutritionPrediction([
    read(),
    read(text.replace("100克", "100毫升"), 95, "contrast"),
  ]);
  assert.equal(result.basisConflict, true);
  assert.ok(
    result.label.warnings.some((w) => w.startsWith("Porsi acuan berbeda")),
  );
});
test("confident complete labels skip rescue; a glare-damaged header stays manual", () => {
  assert.equal(labelNeedsRescue(read(text, 97)), false);
  assert.equal(
    labelNeedsRescue(read(text.replace("每100克", "每100"), 97)),
    false,
  );
});
test("unassigned amount rows trigger rescue even with confident core macros", () => {
  assert.equal(labelNeedsRescue(read(text + "\n251毫克 13%", 97)), true);
});
test("recovering an unassigned sodium row can win with a review hint", () => {
  const original = read(text + "\n251毫克 13%", 93);
  const recovered = read(text + "\n钠 251毫克 13%", 98, "contrast");
  recovered.label.warnings.push(
    "Periksa Natrium. Sebagian tulisan kurang jelas; cocokkan dengan foto.",
  );
  assert.equal(
    bestNutritionPrediction([original, recovered]).winner,
    recovered,
  );
});
test("no predictions cannot yield a fabricated result", () =>
  assert.throws(() => bestNutritionPrediction([])));
