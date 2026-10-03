import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyLabelValues } from "./nutritionLabel.ts";
import { nutritionValidationMetrics } from "./nutritionValidation.ts";
test("validation counts wrong numbers, missing rows and invented extras", () => {
  const expected = {
    ...emptyLabelValues(),
    kcal: 100,
    protein: 10,
    carbs: 10,
    fat: 5,
  };
  const actual = { ...expected, protein: 100, carbs: null, salt: 2 };
  const metrics = nutritionValidationMetrics([{ expected, actual }]);
  assert.equal(metrics.correctDeclaredFields, 2);
  assert.equal(metrics.precision, 0.5);
  assert.equal(metrics.recall, 0.5);
  assert.equal(metrics.accuracy, 0.7);
  assert.equal(metrics.exactCases, 0);
});
test("reference unit is measured independently of correct macros", () => {
  const values = emptyLabelValues();
  const result = nutritionValidationMetrics([
    {
      expected: values,
      actual: values,
      expectedBasis: { amount: 100, unit: "g" },
      actualBasis: null,
    },
  ]);
  assert.equal(result.accuracy, 1);
  assert.equal(result.basisAccuracy, 0);
});
