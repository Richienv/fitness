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
export type ServingSize = {
  amount: number;
  unit: "g" | "ml";
};
export type NutritionLabel = {
  values: LabelValues;
  basis: { amount: number; unit: "g" | "ml" | "serving" } | null;
  basisAmountHint: number | null;
  /** Mass/volume of one serving when declared (e.g. Takaran Saji 30 g / Serving Size 250 ml). */
  servingSize?: ServingSize | null;
  evidence: Partial<Record<LabelKey, string>>;
  warnings: string[];
  text: string;
  energyKj: number | null;
};
const aliases: [LabelKey, RegExp][] = [
  ["kcal", /能量|能置|熱量|热量|energy|energ[il1]|enargi|calories|kalori/i],
  ["protein", /蛋白[质質盾貭]|prot[ei1l]in|protein/i],
  ["carbs", /碳水化[合台]物|碳水|carbohydrate[s]?|karboh[il1]drat|karbohidrat/i],
  ["saturatedFat", /[饱飽]和脂肪(?:酸)?|saturated\s*fat|lemak\s*jenuh|lernak\s*jenuh/i],
  ["transFat", /反式脂肪(?:酸)?|trans\s*fat|lemak\s*trans|lernak\s*trans/i],
  ["fat", /脂肪|total\s*fat|fat(?=\d|:)|\bfat\b|lemak|lernak/i],
  ["sugar", /[糖醣]|sugars?|gula/i],
  ["sodium", /[钠鈉]|sodium|natr[il1]um|natrium/i],
  ["salt", /食[盐鹽]|[盐鹽]|salt(?=\d|:)|\bsalt\b|garam/i],
  ["fiber", /膳食[纤纖][维維]|[纤纖][维維]|fibre|fiber|serat/i],
];
const AMOUNT_UNIT_PATTERN =
  "(?:千焦耳?|千集|千卡|大卡|kkal|kcal|kka1|kca1|kJ|毫克|mg|mq|微克|μg|ug|克|grams?|gr|g)(?![a-z])";
const AMOUNT_RE = new RegExp(
  `(^|[^\\d.-])<?(\\d+(?:[.,]\\d+)?)\\s*(${AMOUNT_UNIT_PATTERN})`,
  "i",
);
const AMOUNT_ALL_RE = new RegExp(
  `<?(\\d+(?:[.,]\\d+)?)(${AMOUNT_UNIT_PATTERN})`,
  "gi",
);
const STANDALONE_AMOUNT_RE = new RegExp(
  `^[\\s·:<(-]*\\d+(?:[.,]\\d+)?\\s*${AMOUNT_UNIT_PATTERN}`,
  "i",
);

export function emptyLabelValues(): LabelValues {
  return Object.fromEntries(LABEL_KEYS.map((k) => [k, null])) as LabelValues;
}

/** Extract declared serving mass/volume ("Takaran Saji 30 g", "Serving Size 1 sachet (25g)", "每份 30克"). */
export function extractServingSize(text: string): ServingSize | null {
  const lines = text.normalize("NFKC").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const combined = `${line} ${lines[i + 1]?.trim() ?? ""}`;
    if (
      !/(?:takaran\s*saji|serving\s*size|per\s*sajian|per\s*serving|每份|每[一1]份|每食用分量|berat\s*bersih|isi\s*bersih)/i.test(
        line,
      )
    ) {
      continue;
    }
    // Prefer parenthetical gram/ml mass first: e.g. "Takaran saji 1 bungkus (40 g)"
    const paren = combined.match(
      /\((\d+(?:[.,]\d+)?)\s*(ml|mL|毫升|g|gr|gram|grams|克)\)/i,
    );
    const direct =
      paren ??
      line.match(
        /(?:takaran\s*saji|serving\s*size|每份|每[一1]份|每食用分量|berat\s*bersih|isi\s*bersih)[^0-9\n]{0,20}(\d+(?:[.,]\d+)?)\s*(ml|mL|毫升|g|gr|gram|grams|克)\b/i,
      ) ??
      combined.match(
        /(?:takaran\s*saji|serving\s*size|每份|每[一1]份|每食用分量)[^0-9]{0,24}(\d+(?:[.,]\d+)?)\s*(ml|mL|毫升|g|gr|gram|grams|克)\b/i,
      );
    if (direct) {
      const amount = Number(direct[1].replace(",", "."));
      if (Number.isFinite(amount) && amount > 0 && amount <= 2000) {
        return {
          amount,
          unit: /ml|毫升/i.test(direct[2]) ? "ml" : "g",
        };
      }
    }
  }
  return null;
}

/** Join narrow split-line rows where a nutrient label sits on line i and its
 *  amount+unit sits alone on line i+1 (common on slim snack packages). */
function joinSplitLabelLines(lines: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const cur = lines[i];
    const compact = cur.replace(/[ \t]/g, "");
    const next = lines[i + 1];
    if (
      next &&
      aliases.some(([, re]) => re.test(compact)) &&
      !AMOUNT_RE.test(compact) &&
      !aliases.some(([, re]) => re.test(next.replace(/[ \t]/g, ""))) &&
      STANDALONE_AMOUNT_RE.test(next.trim())
    ) {
      out.push(`${cur} ${next}`);
      i++;
    } else {
      out.push(cur);
    }
  }
  return out;
}

export function parseNutritionLabel(raw: string): NutritionLabel {
  const text = raw.normalize("NFKC").replace(/\r/g, "");
  const compact = text.replace(/[ \t]/g, "");
  const servingSize = extractServingSize(text);
  const basisMatch = compact.match(
    /(?:每|per)(\d+(?:[.,]\d+)?)\s*(毫升|ml|克|grams?|gr|g)/i,
  );
  const servingMatch = compact.match(
    /(?:每份|每[一1]份|每食用分量|perserving|persajian|pertakaransaji|jumlahpersajian|amountperserving)/i,
  );
  // Values are read left to right. On a two-column label the reference must
  // follow that same order, never unconditionally prefer a later "per 100 g".
  const servingFirst =
    servingMatch && (!basisMatch || servingMatch.index! < basisMatch.index!);
  const dualColumnHeader = text.split("\n").some((row) => {
    const h = row.replace(/\s/g, "");
    return (
      /(?:perserving|persajian|每份|每食用分量)/i.test(h) &&
      /(?:per|每)\d+(?:[.,]\d+)?(?:g|克|ml)/i.test(h)
    );
  });
  const referenceNumber = compact.match(/(?:每|per)(\d+(?:[.,]\d+)?)/i);
  const basisAmountHint = referenceNumber
    ? Number(referenceNumber[1].replace(",", "."))
    : null;
  const basis = servingFirst
    ? { amount: 1, unit: "serving" as const }
    : basisMatch
      ? {
          amount: Number(basisMatch[1].replace(",", ".")),
          unit: /毫升|ml/i.test(basisMatch[2])
            ? ("ml" as const)
            : ("g" as const),
        }
      : null;
  const values = emptyLabelValues();
  const evidence: NutritionLabel["evidence"] = {};
  const warnings: string[] = [];
  const ambiguous = new Set<LabelKey>();
  let energyKj: number | null = null;
  // Only associate explicit row labels with amounts carrying units. NRV% / %AKG is
  // never a nutrient amount, even when the amount column is unreadable.
  const rows = joinSplitLabelLines(text.split("\n"));
  for (const original of rows) {
    // Indonesian packs often print total energy and energy from fat on one
    // line. Ignore only the latter field, not the total next to it.
    const line = original
      .replace(/[ \t]/g, "")
      .split(/(?:energy|energ[il1]|calories|kalori)(?:from|dari)(?:fat|lemak|lernak)/i)[0];
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
    // Reference-intake footnotes are not this food's total energy.
    if (
      key === "kcal" &&
      /berdasarkan|kebutuhan|caloriesaday|dailyvalue|dailyintake/i.test(line)
    )
      continue;
    if (
      ambiguous.has(key) ||
      (key === "sugar" && /糖醇|sugaralcohol|polyol/i.test(line))
    )
      continue;
    const label = pattern.exec(line)!;
    const tail = line
      .slice(label.index + label[0].length)
      .split(/(?:NRV|%?AKG|%?DV|参考值|參考值)/i)[0];
    const allAmounts = [...tail.matchAll(AMOUNT_ALL_RE)];
    let amount = tail.match(AMOUNT_RE);
    // A missing first-column amount must not silently consume the second
    // column's value. Without both printed amounts its column is uncertain.
    if (dualColumnHeader && allAmounts.length < 2) continue;
    // When a single-column energy row prints BOTH kJ and kcal (e.g. "630 kJ / 150 kcal"),
    // prefer the explicit kcal figure and also preserve kJ for transparency.
    if (key === "kcal" && !dualColumnHeader && allAmounts.length >= 2) {
      const kcalMatch = allAmounts.find((m) =>
        /千卡|大卡|kkal|kcal|kka1|kca1/i.test(m[2]),
      );
      const kjMatch = allAmounts.find((m) => /千焦|千集|kj/i.test(m[2]));
      if (kcalMatch && kjMatch) {
        energyKj = Number(kjMatch[1].replace(",", "."));
        amount = [
          kcalMatch[0],
          "",
          kcalMatch[1],
          kcalMatch[2],
        ] as unknown as RegExpMatchArray;
      }
    }
    // "Calories 120" names the energy unit explicitly on US-style labels.
    // Bare "Energy 120" / "能量120" remains unknown: it may be kJ.
    if (!amount && key === "kcal" && /^calories/i.test(label[0])) {
      const calories = tail.match(/^:?(\d+(?:[.,]\d+)?)(?![\d.,])$/i);
      if (calories)
        amount = [
          calories[0],
          "",
          calories[1],
          "kcal",
        ] as unknown as RegExpMatchArray;
    }
    if (!amount) continue;
    if (sodiumConfusion)
      warnings.push(
        "Huruf 钠 terbaca kurang jelas. Angka natrium diisi dari baris mg; periksa dengan foto.",
      );
    const n = Number(amount[2].replace(",", "."));
    const unit = amount[3].toLowerCase();
    let value: number;
    if (key === "kcal") {
      if (/千焦|千集|kj/.test(unit)) {
        energyKj = n;
        value = n / 4.184;
      } else if (/千卡|大卡|kkal|kcal|kka1|kca1/.test(unit)) value = n;
      else continue;
    } else {
      if (/千焦|千集|千卡|大卡|kkal|kcal|kka1|kca1|kj/.test(unit)) continue;
      const grams = /毫克|mg|mq/.test(unit)
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
  const referenceGrams =
    basis?.unit === "g"
      ? basis.amount
      : basis?.unit === "serving" && servingSize?.unit === "g"
        ? servingSize.amount * basis.amount
        : null;
  if (
    referenceGrams !== null &&
    [values.protein, values.carbs, values.fat].every((n) => n !== null) &&
    values.protein! + values.carbs! + values.fat! > referenceGrams * 1.1
  )
    warnings.push(
      "Jumlah makro melebihi berat acuan. Periksa titik desimal dan porsi acuan.",
    );
  // Pure lipid is ~900 kcal per 100 g; values well above that usually mean kJ misread as kcal.
  if (
    basis &&
    (basis.unit === "g" || basis.unit === "ml") &&
    basis.amount <= 100 &&
    values.kcal !== null &&
    values.kcal > (basis.amount / 100) * 950
  )
    warnings.push(
      "Kalori melebihi batas wajar per 100 g. Periksa apakah satuan pada label sebenarnya kJ.",
    );
  if (
    values.kcal !== null &&
    values.kcal > 15 &&
    values.protein === 0 &&
    values.carbs === 0 &&
    values.fat === 0
  )
    warnings.push(
      "Kalori terisi, tetapi semua makro terbaca 0 g. Periksa angka pada label.",
    );
  if (
    values.sodium !== null &&
    values.sodium > (basis?.unit === "serving" ? 3000 : 5000)
  )
    warnings.push(
      "Natrium terbaca sangat tinggi. Periksa apakah satuannya mg atau g pada label.",
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
    ...(servingSize ? { servingSize } : {}),
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
      /营养成分表|營養成分表|nutritionfacts|informasinilaigizi/i.test(
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
  const positions = cells.map((i) => {
    const x = i.poly.reduce((n, p) => n + p[0], 0) / 4;
    const y = i.poly.reduce((n, p) => n + p[1], 0) / 4;
    const slope = (i.poly[1][1] - i.poly[0][1]) / (i.poly[1][0] - i.poly[0][0]);
    const height = Math.max(
      8,
      Math.abs((i.poly[2][1] + i.poly[3][1] - i.poly[0][1] - i.poly[1][1]) / 2),
    );
    const anchor = aliases.some(([, pattern]) =>
      pattern.test(i.text.replace(/\s/g, "")),
    );
    return {
      i,
      x,
      y,
      height,
      slope: Number.isFinite(slope) && Math.abs(slope) < 0.6 ? slope : 0,
      anchor,
    };
  });
  // A curved bag has different slopes in different regions. Start with the
  // nutrient names, then match nearby cells against each row's local baseline.
  // A global page angle can put "60 kkal from fat" on the total-energy row.
  positions.sort((a, b) => Number(b.anchor) - Number(a.anchor) || a.y - b.y);
  const rows: {
    anchor: (typeof positions)[number];
    cells: typeof positions;
  }[] = [];
  const distance = (
    a: (typeof positions)[number],
    b: (typeof positions)[number],
  ) => Math.abs(b.y - a.y - ((a.slope + b.slope) / 2) * (b.x - a.x));
  for (const cell of positions) {
    const row = rows
      .filter(
        (r) =>
          !(cell.anchor && r.anchor.anchor) &&
          distance(r.anchor, cell) <=
            Math.min(r.anchor.height, cell.height) * 0.65,
      )
      .sort((a, b) => distance(a.anchor, cell) - distance(b.anchor, cell))[0];
    if (row) row.cells.push(cell);
    else rows.push({ anchor: cell, cells: [cell] });
  }
  rows.sort((a, b) => a.anchor.y - b.anchor.y);
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
        (key === "kcal" &&
          /calories/i.test(row.text) &&
          /^\d+(?:[.,]\d+)?$/.test(text)) ||
        new RegExp(`\\d(?:[.,]\\d+)?${AMOUNT_UNIT_PATTERN}`, "i").test(text)
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
      /(?:每|per)\s*(?:\d|份|serving|sajian)/i.test(r.text.normalize("NFKC")),
    )) {
      scores.push(
        ...row.cells
          .filter((c) =>
            /每|per|^(?:克|g|毫升|ml|sajian|serving)$/i.test(
              c.text.normalize("NFKC").trim(),
            ),
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
