import {
  LABEL_KEYS,
  type LabelValues,
  type NutritionLabel,
} from "./nutritionLabel.ts";
export type NutritionValidationCase = {
  expected: LabelValues;
  actual: LabelValues;
  expectedBasis?: NutritionLabel["basis"];
  actualBasis?: NutritionLabel["basis"];
};
/** Per-field correctness: a returned wrong number is a false positive and a miss. */
export function nutritionValidationMetrics(cases: NutritionValidationCase[]) {
  let correct = 0,
    returned = 0,
    declared = 0,
    fields = 0,
    equal = 0,
    exactCases = 0,
    basisCorrect = 0,
    basisCases = 0;
  for (const item of cases) {
    let exact = true;
    for (const key of LABEL_KEYS) {
      const a = item.actual[key],
        e = item.expected[key];
      const matches =
        e === null ? a === null : a !== null && Math.abs(e - a) <= 0.01;
      fields++;
      equal += Number(matches);
      exact &&= matches;
      returned += Number(a !== null);
      declared += Number(e !== null);
      correct += Number(matches && e !== null);
    }
    exactCases += Number(exact);
    if (item.expectedBasis !== undefined) {
      basisCases++;
      basisCorrect += Number(
        JSON.stringify(item.expectedBasis) === JSON.stringify(item.actualBasis),
      );
    }
  }
  return {
    cases: cases.length,
    fields,
    correctDeclaredFields: correct,
    returnedFields: returned,
    declaredFields: declared,
    accuracy: fields ? equal / fields : 0,
    precision: returned ? correct / returned : 0,
    recall: declared ? correct / declared : 0,
    exactCases,
    basisAccuracy: basisCases ? basisCorrect / basisCases : null,
  };
}
