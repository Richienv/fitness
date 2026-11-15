import test from "node:test";
import assert from "node:assert/strict";
import {
  parseNutritionLabel,
  labelCanAutoCapture,
  labelFingerprint,
  scaleNutritionExtras,
  sodiumToSalt,
  labelConfidenceFromOcr,
  labelTextFromOcr,
  confirmLabelRead,
  withLabelConfidenceWarnings,
} from "./nutritionLabel.ts";
const example = `营养成分表\n项目 每100克 NRV%\n能量 2228千焦 27%\n蛋白质 8.2克 14%\n脂肪 28.6克 48%\n-饱和脂肪 16.0克 80%\n-反式脂肪酸 0克\n碳水化合物 60.6克 20%\n-糖 18.0克\n钠 251毫克 13%`;
test("Chinese example converts kJ, ignores NRV and separates fat subtypes", () => {
  const n = parseNutritionLabel(example);
  assert.deepEqual(n.basis, { amount: 100, unit: "g" });
  assert.ok(Math.abs(n.values.kcal! - 2228 / 4.184) < 0.0001);
  assert.equal(n.energyKj, 2228);
  assert.equal(n.values.protein, 8.2);
  assert.equal(n.values.carbs, 60.6);
  assert.equal(n.values.fat, 28.6);
  assert.equal(n.values.saturatedFat, 16);
  assert.equal(n.values.transFat, 0);
  assert.equal(n.values.sugar, 18);
  assert.equal(n.values.sodium, 251);
  assert.equal(n.values.salt, null);
  assert.equal(sodiumToSalt(251), 0.6275);
  assert.deepEqual(n.warnings, []);
});
test("a single complete reading needs high confidence and no consistency warning", () => {
  const good = parseNutritionLabel(example);
  assert.equal(labelCanAutoCapture(good, 96, 1), true);
  assert.equal(labelCanAutoCapture(good, 91, 1), false);
  assert.equal(
    labelCanAutoCapture(
      parseNutritionLabel(example.replace("每100克", "每100时")),
      99,
      1,
    ),
    false,
  );
  const wrongEnergy = parseNutritionLabel(
    example.replace("2228千焦", "2228千卡"),
  );
  assert.ok(wrongEnergy.warnings.some((w) => w.includes("Energi")));
  assert.equal(labelCanAutoCapture(wrongEnergy, 99, 1), false);
});
test("missing optional rows do not reset stable core readings; conflicting extras stay unknown", () => {
  const a = parseNutritionLabel(example);
  const missingSugar = parseNutritionLabel(example.replace("-糖 18.0克", ""));
  assert.equal(labelFingerprint(a), labelFingerprint(missingSugar));
  assert.equal(confirmLabelRead(a, missingSugar).values.sugar, null);
  const differentSugar = confirmLabelRead(
    a,
    parseNutritionLabel(example.replace("-糖 18.0克", "-糖 8.0克")),
  );
  assert.equal(differentSugar.values.sugar, null);
  assert.ok(differentSugar.warnings.some((w) => w.includes("Gula")));
});
test("confidence follows core label and amount cells, ignoring NRV and unrelated print", () => {
  const cell = (text: string, score: number, x: number, y: number) => ({
    text,
    score,
    poly: [
      [x, y],
      [x + 80, y],
      [x + 80, y + 18],
      [x, y + 18],
    ],
  });
  const items = [
    cell("每100克", 0.99, 120, 0),
    cell("蛋白质", 0.98, 0, 50),
    cell("8.2克", 0.95, 120, 50),
    cell("14%", 0.55, 240, 50),
    cell("包装文字", 0.51, 0, 100),
  ];
  const n = parseNutritionLabel("每100克\n蛋白质 8.2克 14%\n包装文字");
  assert.equal(labelConfidenceFromOcr(items, n), 95);
  for (const damaged of ["1496", "480%0"]) {
    items[3].text = damaged;
    const damagedLabel = parseNutritionLabel(labelTextFromOcr(items));
    assert.equal(labelConfidenceFromOcr(items, damagedLabel), 95);
    assert.ok(
      !withLabelConfidenceWarnings(items, damagedLabel).warnings.some(
        (w) => w.includes("Protein") && w.includes("kurang jelas"),
      ),
    );
  }
  items[3].text = "14%";
  items[2].score = 0.61;
  assert.equal(labelConfidenceFromOcr(items, n), 61);
  const warned = withLabelConfidenceWarnings(items, n);
  assert.ok(
    warned.warnings.some(
      (w) => w.includes("Protein") && w.includes("kurang jelas"),
    ),
  );
  assert.equal(warned.values.protein, 8.2);
});
test("full width numbers and spaced OCR Chinese labels remain readable", () => {
  const n = parseNutritionLabel(
    "每 １００ 毫升\n能 量 ２００ 千 焦\n蛋 白 质 ３，２ 克\n脂 肪 ２ 克\n碳 水 化 合 物 ４ 克\n钠 ０．１ 克",
  );
  assert.deepEqual(n.basis, { amount: 100, unit: "ml" });
  assert.equal(n.values.protein, 3.2);
  assert.equal(n.values.sodium, 100);
});
test("English amounts and serving basis do not assume per100g", () => {
  const n = parseNutritionLabel(
    "Per serving\nCalories 120 kcal\nProtein 4 g\nFat 2 g\nCarbohydrates 21 g\nSalt 300 mg\nFibre 1 g",
  );
  assert.deepEqual(n.basis, { amount: 1, unit: "serving" });
  assert.equal(n.values.kcal, 120);
  assert.equal(n.values.fat, 2);
  assert.equal(n.values.salt, 0.3);
  assert.equal(n.values.fiber, 1);
});
test("NRV-only or absent amounts stay unknown, never zero", () => {
  const n = parseNutritionLabel(
    "每100克\n蛋白质 14%\n脂肪 48%\n能量 27%\n钠 13%",
  );
  assert.equal(n.values.protein, null);
  assert.equal(n.values.fat, null);
  assert.equal(n.values.kcal, null);
  assert.equal(n.values.sodium, null);
  assert.equal(labelCanAutoCapture(n, 95, 10), false);
});
test("unknown energy units and negative numbers do not become calories", () => {
  assert.equal(
    parseNutritionLabel("能量 2228\n蛋白质 -8.2克").values.kcal,
    null,
  );
  assert.equal(parseNutritionLabel("蛋白质 -8.2克").values.protein, null);
});
test("inconsistent duplicate rows require review and ambiguous basis stays null", () => {
  const n = parseNutritionLabel("蛋白质 8.2克\n蛋白质 2.2克");
  assert.equal(n.values.protein, null);
  assert.equal(n.basis, null);
  assert.ok(n.warnings.length > 0);
});
test("auto capture requires repeated stable readings and a known basis", () => {
  const n = parseNutritionLabel(example);
  assert.equal(labelCanAutoCapture(n, 90, 1), false);
  assert.equal(labelCanAutoCapture(n, 90, 2), true);
  assert.equal(labelCanAutoCapture(n, 40, 4), false);
  const m = parseNutritionLabel(example.replace("每100克", ""));
  assert.equal(labelCanAutoCapture(m, 90, 4), true);
  assert.equal(
    labelCanAutoCapture(
      parseNutritionLabel(m.text.replace("营养成分表", "")),
      90,
      4,
    ),
    false,
  );
  assert.notEqual(labelFingerprint(n), labelFingerprint(m));
});
test("nutrition extras scale consumed portions without inventing missing values", () => {
  assert.deepEqual(
    scaleNutritionExtras(
      { sugar: 18, sodium: 251, saturatedFat: 16, transFat: 0 },
      0.3,
    ),
    { sugar: 5.3999999999999995, sodium: 75.3, saturatedFat: 4.8, transFat: 0 },
  );
  assert.deepEqual(scaleNutritionExtras({ salt: NaN, fiber: -1 }, 1), {});
});
test("skewed detected table cells join amounts to their nutrient row", async () => {
  const { labelTextFromOcr } = await import("./nutritionLabel.ts");
  const box = (text: string, x: number, y: number, w: number) => ({
    text,
    score: 0.98,
    poly: [
      [x, y],
      [x + w, y - w * 0.1],
      [x + w, y - w * 0.1 + 20],
      [x, y + 20],
    ],
  });
  const text = labelTextFromOcr([
    box("每100克", 200, 30, 80),
    box("蛋白质", 20, 100, 80),
    box("8.2克", 200, 82, 70),
    box("14%", 350, 67, 40),
    box("钠", 20, 140, 30),
    box("251毫克", 200, 122, 90),
    box("13%", 350, 107, 40),
  ]);
  const n = parseNutritionLabel(text);
  assert.equal(n.values.protein, 8.2);
  assert.equal(n.values.sodium, 251);
  assert.deepEqual(n.basis, { amount: 100, unit: "g" });
});
test("actual sample OCR flags sodium character correction without guessing the reference unit", () => {
  const n = parseNutritionLabel(
    example.replace("每100克", "每100时").replace("钠 251", "钢 251"),
  );
  assert.equal(n.values.sodium, 251);
  assert.equal(n.basis, null);
  assert.equal(n.basisAmountHint, 100);
  assert.ok(n.warnings.some((w) => w.includes("钠")));
  assert.equal(parseNutritionLabel("钢251毫克").values.sodium, null);
});

test("Indonesian snack labels read energi total, kkal, grams and per sajian", () => {
  const label = parseNutritionLabel(`INFORMASI NILAI GIZI
Takaran saji 30 g
Jumlah per sajian
Energi total 150 kkal
Energi dari lemak 50 kkal
Lemak total 6 g
Protein 3 g
Karbohidrat total 21 g
Gula 8 g
Natrium 120 mg`);
  assert.deepEqual(label.basis, { amount: 1, unit: "serving" });
  assert.equal(label.values.kcal, 150);
  assert.equal(label.values.fat, 6);
  assert.equal(label.values.carbs, 21);
  assert.equal(label.values.sodium, 120);
  assert.deepEqual(
    parseNutritionLabel("Per 100 gr\nEnergi 500 kkal\nProtein 8 gram").basis,
    { amount: 100, unit: "g" },
  );
  assert.equal(
    parseNutritionLabel("Per 100 gr\nProtein 8 gram").values.protein,
    8,
  );
});
test("Calories names a unit, while unknown energy numbers and percentages stay empty", () => {
  assert.equal(
    parseNutritionLabel("Amount per serving\nCalories 120").values.kcal,
    120,
  );
  assert.equal(parseNutritionLabel("Calories 12%").values.kcal, null);
  assert.equal(parseNutritionLabel("Energy 120").values.kcal, null);
  assert.equal(parseNutritionLabel("能量120").values.kcal, null);
});

test("large FDA calorie numerals align with Calories, not the small heading above", () => {
  const box = (
    text: string,
    x: number,
    y: number,
    w: number,
    h: number,
    score = 0.98,
  ) => ({
    text,
    score,
    poly: [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h],
    ],
  });
  const items = [
    box("Amount per serving", 10, 45, 120, 14),
    box("230", 200, 53, 80, 45, 0.72),
    box("Calories", 10, 57, 130, 40),
  ];
  const text = labelTextFromOcr(items);
  assert.match(text, /Calories 230/);
  const label = parseNutritionLabel(text);
  assert.equal(label.values.kcal, 230);
  assert.equal(labelConfidenceFromOcr(items, label), 72);
});

test("real bilingual two-column snack keeps serving values with serving basis", () => {
  const label = parseNutritionLabel(`Per Serving/ Per 100g
每食用分量 每100克
Energy/能量 109kcal/千卡544.9 kcal/千卡
Protein/蛋白質 1.3g/克 6.5g/克
Total Fat/總脂肪 6.7g/克 33.6g/克
Total Carbohydrates/總碳水化合物10.8g/克 54.1g/克`);
  assert.deepEqual(label.basis, { amount: 1, unit: "serving" });
  assert.equal(label.values.kcal, 109);
  assert.equal(label.values.protein, 1.3);
  const reversed = parseNutritionLabel(
    "Per 100g / Per serving\nEnergy 544.9 kcal 109 kcal\nProtein 6.5g 1.3g",
  );
  assert.deepEqual(reversed.basis, { amount: 100, unit: "g" });
  assert.equal(reversed.values.kcal, 544.9);
});
test("total energy survives energy-from-fat printed on the same row", () => {
  assert.equal(
    parseNutritionLabel("Energi Total 100 kkal Energi dari Lemak 45 kkal")
      .values.kcal,
    100,
  );
  assert.equal(
    parseNutritionLabel("Energi dari Lemak 45 kkal").values.kcal,
    null,
  );
});
test("a g misrecognized as 9 stays unknown, never invent a decimal or gram unit", () => {
  const label = parseNutritionLabel(
    "Per sajian\nProtein 19 2%\nLemak Total 69 10%",
  );
  assert.equal(label.values.protein, null);
  assert.equal(label.values.fat, null);
});

test("two-column missing serving amount cannot become the per-100g value", () => {
  const n = parseNutritionLabel(
    "Per Serving / Per 100g\nProtein 6.5g\nFat 33.6g\nEnergy 109 kcal 544.9 kcal",
  );
  assert.equal(n.values.protein, null);
  assert.equal(n.values.fat, null);
  assert.equal(n.values.kcal, 109);
});
test("reference energy footnote never overwrites snack calories", () => {
  const n = parseNutritionLabel(
    "Per sajian\nEnergl Total 100 kkal Energi dari Lemak 45 kkal\nPersen AKG berdasarkan kebutuhan energi 2150 kkal",
  );
  assert.equal(n.values.kcal, 100);
});

test("actual curved snack geometry keeps energy and grams on their own rows", async () => {
  const { readFile } = await import("node:fs/promises");
  const fixtures = JSON.parse(
    await readFile(
      new URL("./fixtures/nutrition-real-geometry.json", import.meta.url),
      "utf8",
    ),
  );
  const lite = parseNutritionLabel(labelTextFromOcr(fixtures[0].items));
  assert.deepEqual(
    [lite.values.kcal, lite.values.protein, lite.values.carbs, lite.values.fat],
    [100, 1, 10, 6],
  );
  const lays = parseNutritionLabel(labelTextFromOcr(fixtures[1].items));
  assert.equal(lays.values.kcal, 160);
  assert.equal(lays.values.fat, 10);
});
