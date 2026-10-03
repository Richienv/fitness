export const LABEL_KEYS = [
  "kcal",
  "protein",
  "carbs",
  "fat",
  "sugar",
  "sodium",
  "salt",
  "saturatedFat",
  "transFat",
  "fiber",
] as const;
export type LabelKey = (typeof LABEL_KEYS)[number];
export type LabelValues = Record<LabelKey, number | null>;
const nutrientNames: Record<LabelKey, string> = {
  kcal: "Kalori",
  protein: "Protein",
  carbs: "Karbohidrat",
  fat: "Lemak",
  sugar: "Gula",
  sodium: "Natrium",
  salt: "Garam",
  saturatedFat: "Lemak jenuh",
  transFat: "Lemak trans",
  fiber: "Serat",
};
export type NutritionLabel = {
  values: LabelValues;
  basis: { amount: number; unit: "g" | "ml" | "serving" } | null;
  basisAmountHint: number | null;
  evidence: Partial<Record<LabelKey, string>>;
  warnings: string[];
  text: string;
  energyKj: number | null;
};
const aliases: [LabelKey, RegExp][] = [
  ["kcal", /能量|熱量|热量|energy|calories|kalori/i],
  ["protein", /蛋白[质質]|protein/i],
  ["carbs", /碳水化合物|碳水|carbohydrate[s]?|karbohidrat/i],
  ["saturatedFat", /[饱飽]和脂肪(?:酸)?|saturated\s*fat|lemak\s*jenuh/i],
  ["transFat", /反式脂肪(?:酸)?|trans\s*fat|lemak\s*trans/i],
  ["fat", /脂肪|total\s*fat|fat(?=\d|:)|\bfat\b|lemak/i],
  ["sugar", /[糖醣]|sugars?|gula/i],
  ["sodium", /[钠鈉]|sodium|natrium/i],
  ["salt", /食[盐鹽]|[盐鹽]|salt(?=\d|:)|\bsalt\b|garam/i],
  ["fiber", /膳食[纤纖][维維]|[纤纖][维維]|fibre|fiber|serat/i],
];
export function emptyLabelValues(): LabelValues {
  return Object.fromEntries(LABEL_KEYS.map((k) => [k, null])) as LabelValues;
}
export function parseNutritionLabel(raw: string): NutritionLabel {
  const text = raw.normalize("NFKC").replace(/\r/g, "");
  const compact = text.replace(/[ \t]/g, "");
  const basisMatch = compact.match(
    /(?:每|per)(\d+(?:[.,]\d+)?)\s*(毫升|ml|克|g)/i,
  );
  const serving = /(?:每份|每[一1]份|perserving|persajian)/i.test(compact);
  const referenceNumber = compact.match(/(?:每|per)(\d+(?:[.,]\d+)?)/i);
  const basisAmountHint = referenceNumber
    ? Number(referenceNumber[1].replace(",", "."))
    : null;
  const basis = basisMatch
    ? {
        amount: Number(basisMatch[1].replace(",", ".")),
        unit: /毫升|ml/i.test(basisMatch[2]) ? ("ml" as const) : ("g" as const),
      }
    : serving
      ? { amount: 1, unit: "serving" as const }
      : null;
  const values = emptyLabelValues();
  const evidence: NutritionLabel["evidence"] = {};
  const warnings: string[] = [];
  const ambiguous = new Set<LabelKey>();
  let energyKj: number | null = null;
  // Only associate explicit row labels with amounts carrying units. NRV% is
  // never a nutrient amount, even when the amount column is unreadable.
  for (const original of text.split("\n")) {
    const line = original.replace(/[ \t]/g, "");
    let match = aliases.find(([, pattern]) => pattern.test(line));
    const sodiumConfusion =
      !match &&
      /营养成分表|營養成分表/.test(compact) &&
      [values.kcal, values.protein, values.carbs, values.fat].every(
        (n) => n !== null,
      ) &&
      /^[-·]*(?:钢|納|纳)\d+(?:[.,]\d+)?(?:毫克|mg)/i.test(line);
    if (sodiumConfusion) match = ["sodium", /钢|納|纳/];
    if (!match) continue;
    const [key, pattern] = match;
    if (
      ambiguous.has(key) ||
      (key === "sugar" && /糖醇|sugaralcohol|polyol/i.test(line))
    )
      continue;
    const label = pattern.exec(line)!;
    const tail = line
      .slice(label.index + label[0].length)
      .split(/(?:NRV|参考值|參考值)/i)[0];
    const amount = tail.match(
      /(^|[^\d.-])(\d+(?:[.,]\d+)?)\s*(千焦耳?|千卡|大卡|kcal|kJ|毫克|mg|微克|μg|ug|克|g)(?![a-z])/i,
    );
    if (!amount) continue;
    if (sodiumConfusion)
      warnings.push(
        "Huruf 钠 terbaca kurang jelas. Angka natrium diisi dari baris mg; periksa dengan foto.",
      );
    const n = Number(amount[2].replace(",", "."));
    const unit = amount[3].toLowerCase();
    let value: number;
    if (key === "kcal") {
      if (/千焦|kj/.test(unit)) {
        energyKj = n;
        value = n / 4.184;
      } else if (/千卡|大卡|kcal/.test(unit)) value = n;
      else continue;
    } else {
      if (/千焦|千卡|大卡|kcal|kj/.test(unit)) continue;
      const grams = /毫克|mg/.test(unit)
        ? n / 1000
        : /微克|μg|ug/.test(unit)
          ? n / 1e6
          : n;
      value = key === "sodium" ? grams * 1000 : grams;
    }
    if (values[key] !== null && Math.abs(values[key]! - value) > 0.01) {
      warnings.push(
        `Ada dua angka berbeda untuk ${nutrientNames[key]}; periksa label.`,
      );
      ambiguous.add(key);
      values[key] = null;
      delete evidence[key];
      continue;
    }
    values[key] = Math.round(value * 10000) / 10000;
    evidence[key] = original.trim();
  }
  if (!basis || !Number.isFinite(basis.amount) || basis.amount <= 0)
    warnings.push(
      "Porsi acuan belum terbaca. Pilih per 100 g, per 100 ml, atau per sajian sesuai label.",
    );
  if (
    values.sugar !== null &&
    values.carbs !== null &&
    values.sugar > values.carbs
  )
    warnings.push(
      "Gula terbaca lebih besar dari karbohidrat. Periksa kedua angka.",
    );
  if (
    values.saturatedFat !== null &&
    values.fat !== null &&
    values.saturatedFat > values.fat
  )
    warnings.push(
      "Lemak jenuh terbaca lebih besar dari lemak total. Periksa kedua angka.",
    );
  if (
    basis?.unit === "g" &&
    [values.protein, values.carbs, values.fat].every((n) => n !== null) &&
    values.protein! + values.carbs! + values.fat! > basis.amount * 1.1
  )
    warnings.push(
      "Jumlah makro melebihi berat acuan. Periksa titik desimal dan porsi acuan.",
    );
  if (
    [values.kcal, values.protein, values.carbs, values.fat].every(
      (n) => n !== null,
    )
  ) {
    const estimated = values.protein! * 4 + values.carbs! * 4 + values.fat! * 9;
    // A review hint only: fiber, polyols and alcohol can legitimately differ.
    if (
      Math.abs(values.kcal! - estimated) >
      Math.max(50, Math.max(values.kcal!, estimated) * 0.3)
    )
      warnings.push(
        "Energi jauh berbeda dari jumlah makro. Periksa kJ/kkal dan titik desimal; jangan ubah angka tanpa melihat label.",
      );
  }
  const missing = ["kcal", "protein", "carbs", "fat"].filter(
    (k) => values[k as LabelKey] === null,
  );
  if (missing.length)
    warnings.push(
      "Sebagian nutrisi belum terbaca. Kolom kosong harus dilengkapi sebelum ditambahkan.",
    );
  return {
    values,
    basis: basis && basis.amount > 0 ? basis : null,
    basisAmountHint:
      basisAmountHint && basisAmountHint > 0 ? basisAmountHint : null,
    evidence,
    warnings,
    text,
    energyKj,
  };
}
export function labelFingerprint(label: NutritionLabel): string {
  // Optional rows blinking in/out should not restart confirmation of the core.
  return JSON.stringify([
    label.basis,
    label.basisAmountHint,
    [
      label.values.kcal,
      label.values.protein,
      label.values.carbs,
      label.values.fat,
    ],
  ]);
}
export function labelCanAutoCapture(
  label: NutritionLabel,
  confidence: number,
  repeats: number,
): boolean {
  const count = ["kcal", "protein", "carbs", "fat"].filter(
    (k) => label.values[k as LabelKey] !== null,
  ).length;
  return (
    (!!label.basis ||
      /营养成分表|營養成分表|nutritionfacts/i.test(
        label.text.replace(/\s/g, ""),
      )) &&
    confidence >= 60 &&
    ((count === 4 &&
      !!label.basis &&
      confidence >= 92 &&
      label.warnings.length === 0 &&
      repeats >= 1) ||
      (count === 4 && repeats >= 2) ||
      (count >= 2 && repeats >= 3))
  );
}
export const sodiumToSalt = (sodiumMg: number) => (sodiumMg * 2.5) / 1000;
export type NutritionExtras = Partial<
  Record<Exclude<LabelKey, "kcal" | "protein" | "carbs" | "fat">, number>
>;
export function scaleNutritionExtras(
  source: NutritionExtras,
  multiplier: number,
): NutritionExtras {
  return Object.fromEntries(
    ["sugar", "sodium", "salt", "saturatedFat", "transFat", "fiber"].flatMap(
      (key) => {
        const n = source[key as keyof NutritionExtras];
        return typeof n === "number" && Number.isFinite(n) && n >= 0
          ? [[key, n * multiplier]]
          : [];
      },
    ),
  );
}
export type LabelOcrItem = { text: string; score: number; poly: number[][] };
/** Join detected table cells along their actual slanted rows before parsing. */
function labelRowsFromOcr(items: LabelOcrItem[]) {
  const cells = items.filter((i) => i.score >= 0.5 && i.poly.length === 4);
  const slopes = cells
    .map((i) => (i.poly[1][1] - i.poly[0][1]) / (i.poly[1][0] - i.poly[0][0]))
    .filter((n) => Number.isFinite(n) && Math.abs(n) < 0.6)
    .sort((a, b) => a - b);
  const slope = slopes[Math.floor(slopes.length / 2)] ?? 0;
  const positions = cells
    .map((i) => {
      const x = i.poly.reduce((n, p) => n + p[0], 0) / 4;
      const y = i.poly.reduce((n, p) => n + p[1], 0) / 4 - slope * x;
      const height = Math.max(
        8,
        Math.abs(
          (i.poly[2][1] + i.poly[3][1] - i.poly[0][1] - i.poly[1][1]) / 2,
        ),
      );
      return { i, x, y, height };
    })
    .sort((a, b) => a.y - b.y);
  const rows: { y: number; height: number; cells: typeof positions }[] = [];
  for (const cell of positions) {
    const row = rows.find(
      (r) => Math.abs(r.y - cell.y) <= Math.max(r.height, cell.height) * 0.55,
    );
    if (row) row.cells.push(cell);
    else rows.push({ y: cell.y, height: cell.height, cells: [cell] });
  }
  return rows.map((r) => {
    const cells = r.cells.sort((a, b) => a.x - b.x).map((c) => c.i);
    return { text: cells.map((c) => c.text).join(" "), cells };
  });
}
export function labelTextFromOcr(items: LabelOcrItem[]): string {
  return labelRowsFromOcr(items)
    .map((r) => r.text)
    .join("\n");
}
function nutrientCellScores(
  row: ReturnType<typeof labelRowsFromOcr>[number],
  key: LabelKey,
) {
  const pattern = aliases.find(([name]) => name === key)![1];
  return row.cells
    .filter((cell) => {
      const text = cell.text.normalize("NFKC").replace(/\s/g, "");
      // Score the nutrient name and explicit amount unit, never the NRV column.
      // A damaged percent sign can turn NRV into "1496" or "480%0".
      return (
        pattern.test(text) ||
        /\d(?:[.,]\d+)?(?:千焦耳?|千卡|大卡|kcal|kJ|毫克|mg|微克|μg|ug|克|g)(?![a-z])/i.test(
          text,
        )
      );
    })
    .map((cell) => cell.score);
}
/** Use the weakest relevant label/amount cell, rather than unrelated packaging text. */
export function labelConfidenceFromOcr(
  items: LabelOcrItem[],
  label: NutritionLabel,
): number {
  const rows = labelRowsFromOcr(items);
  const scores = ["kcal", "protein", "carbs", "fat"].flatMap((k) => {
    const key = k as LabelKey;
    const row = rows.find(
      (r) => r.text.normalize("NFKC").trim() === label.evidence[key],
    );
    return row ? nutrientCellScores(row, key) : [];
  });
  if (label.basis)
    for (const row of rows.filter((r) =>
      /(?:每|per)\s*(?:\d|份|serving)/i.test(r.text.normalize("NFKC")),
    )) {
      scores.push(
        ...row.cells
          .filter((c) =>
            /每|per|^(?:克|g|毫升|ml)$/i.test(c.text.normalize("NFKC").trim()),
          )
          .map((c) => c.score),
      );
    }
  return scores.length ? Math.min(...scores) * 100 : 0;
}
export function withLabelConfidenceWarnings(
  items: LabelOcrItem[],
  label: NutritionLabel,
): NutritionLabel {
  const rows = labelRowsFromOcr(items);
  const unclear = LABEL_KEYS.filter((key) => {
    const row = rows.find(
      (r) => r.text.normalize("NFKC").trim() === label.evidence[key],
    );
    const scores = row ? nutrientCellScores(row, key) : [];
    return scores.length && Math.min(...scores) < 0.8;
  });
  return unclear.length
    ? {
        ...label,
        warnings: [
          ...label.warnings,
          `Periksa ${unclear.map((key) => nutrientNames[key]).join(", ")}. Sebagian tulisan kurang jelas; cocokkan dengan foto.`,
        ],
      }
    : label;
}
export function confirmLabelRead(
  previous: NutritionLabel,
  current: NutritionLabel,
): NutritionLabel {
  const result = {
    ...current,
    values: { ...current.values },
    evidence: { ...current.evidence },
    warnings: [...current.warnings],
  };
  for (const key of LABEL_KEYS.filter(
    (k) => !["kcal", "protein", "carbs", "fat"].includes(k),
  )) {
    const a = previous.values[key],
      b = current.values[key];
    if (a !== null && b !== null && Math.abs(a - b) > 0.01) {
      result.values[key] = null;
      delete result.evidence[key];
      result.warnings.push(
        `Angka ${nutrientNames[key]} berubah antar pembacaan. Cocokkan dengan foto sebelum diisi.`,
      );
    }
  }
  return result;
}
