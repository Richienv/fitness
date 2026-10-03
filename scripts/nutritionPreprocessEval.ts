import { readFileSync } from "node:fs";
import { nutritionValidationMetrics } from "../lib/nutritionValidation.ts";
import type { LabelValues, NutritionLabel } from "../lib/nutritionLabel.ts";
type Case = {
  name: string;
  expected: LabelValues;
  expectedBasis?: NutritionLabel["basis"];
  baseline: { label: NutritionLabel; elapsedMs: number };
  optimized: {
    label: NutritionLabel;
    elapsedMs: number;
    method: string;
    passes: number;
    preprocessMs: number;
  };
};
const path = process.argv[2];
if (!path)
  throw new Error(
    "Usage: tsx scripts/nutritionPreprocessEval.ts <labeled-results.json>",
  );
const { cases } = JSON.parse(readFileSync(path, "utf8")) as { cases: Case[] };
const summarize = (kind: "baseline" | "optimized") => ({
  ...nutritionValidationMetrics(
    cases.map((item) => ({
      expected: item.expected,
      actual: item[kind].label.values,
      expectedBasis: item.expectedBasis,
      actualBasis: item[kind].label.basis,
    })),
  ),
  meanMs: cases.reduce((n, item) => n + item[kind].elapsedMs, 0) / cases.length,
});
console.log(
  JSON.stringify(
    {
      baseline: summarize("baseline"),
      optimized: summarize("optimized"),
      cases: cases.map((item) => ({
        name: item.name,
        method: item.optimized.method,
        passes: item.optimized.passes,
        preprocessMs: item.optimized.preprocessMs,
        baselineMs: item.baseline.elapsedMs,
        optimizedMs: item.optimized.elapsedMs,
      })),
    },
    null,
    2,
  ),
);
