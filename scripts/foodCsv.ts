// Shared CSV parsing + data-hygiene logic for the food-composition seed.
// Imported by both scripts/seed-foods.ts and scripts/seed-foods.test.ts so the
// test exercises the *real* parser and clamps (no DB required).
//
// Design rule that pervades this file: an empty CSV cell means "not measured"
// and MUST become `null`, never 0. Numeric zeros only ever come from a literal
// "0" in the source data.

/** The 21 nutrient columns, per 100 g edible portion. Order matches the CSV. */
export const NUTRIENT_KEYS = [
  "water_g",
  "energy_kcal",
  "protein_g",
  "fat_g",
  "carb_g",
  // Skor Sehat weights "gula rendah" at 20 of 100. Without this column every
  // catalogue food reported 0 g of sugar, which scored FULL marks for sugar —
  // a free fifth of the health score, on the number the TEMAN board ranks by.
  "sugar_g",
  "fiber_g",
  "ash_g",
  "calcium_mg",
  "phosphorus_mg",
  "iron_mg",
  "sodium_mg",
  "potassium_mg",
  "copper_mg",
  "zinc_mg",
  "retinol_mcg",
  "beta_carotene_mcg",
  "carotene_total_mcg",
  "thiamin_mg",
  "riboflavin_mg",
  "niacin_mg",
  "vitc_mg",
] as const;

export type NutrientKey = (typeof NUTRIENT_KEYS)[number];

/** One parsed food row. Nutrient values are `number | null` at the parse
 *  layer; the seed converts them to Prisma.Decimal at the DB boundary. */
export interface FoodRow {
  code: string;
  name: string;
  nameNormalized: string;
  state: string | null;
  foodGroup: string | null;
  /** Optional cuisine / "genre" tag (padang, chinese, japanese, …) used to
   *  group the food search. Absent in older CSVs → null. */
  cuisine: string | null;
  bddPct: number;
  portionGCooked: number | null;
  /** Space-separated alternative names, for search recall only. */
  aliases: string | null;
  note: string | null;
  nutrients: Record<NutrientKey, number | null>;
}

/**
 * Parse one line of CSV into fields, honouring double-quoted fields that may
 * contain commas (the `name`/`note` columns are quoted) and escaped quotes
 * (`""`). Deliberately small and dependency-free.
 */
export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++; // skip the escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(field);
      field = "";
    } else {
      field += ch;
    }
  }
  out.push(field);
  return out;
}

/** Split a whole CSV file into non-empty logical rows (header + data). */
export function splitCsvRows(text: string): string[] {
  // Normalise line endings; drop a trailing newline / blank lines.
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((l) => l.length > 0);
}

/** Empty string → null; otherwise a finite number. Never coerces "" to 0. */
export function numOrNull(raw: string | undefined): number | null {
  if (raw == null) return null;
  const s = raw.trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** lowercase + strip diacritics, for search + normalized storage. */
export function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

/**
 * Copper clamp: TKPI has many data-entry errors where copper_mg is orders of
 * magnitude too high (µg mistakenly recorded as mg). Any value > 20 mg / 100 g
 * is implausible for food, so we treat it as unknown → null. Returns the
 * (possibly nulled) value; caller logs affected rows.
 */
export function clampCopper(value: number | null): number | null {
  if (value == null) return value;
  return value > 20 ? null : value;
}

/**
 * Atwater sanity check. Returns a warning object when a declared energy value
 * disagrees with the macro-computed energy by > 30 % of the declared value.
 * We KEEP the declared value regardless — this only flags for review.
 */
export function atwaterCheck(row: {
  code: string;
  energy_kcal: number | null;
  protein_g: number | null;
  fat_g: number | null;
  carb_g: number | null;
}): { code: string; declared: number; computed: number; diffPct: number } | null {
  const { energy_kcal, protein_g, fat_g, carb_g } = row;
  if (energy_kcal == null || energy_kcal === 0) return null;
  const computed = 4 * (protein_g ?? 0) + 9 * (fat_g ?? 0) + 4 * (carb_g ?? 0);
  const diffPct = Math.abs(energy_kcal - computed) / Math.abs(energy_kcal);
  if (diffPct > 0.3) {
    return {
      code: row.code,
      declared: energy_kcal,
      computed: Math.round(computed * 10) / 10,
      diffPct: Math.round(diffPct * 1000) / 10,
    };
  }
  return null;
}

/**
 * Parse a food-composition CSV (TKPI or custom). Returns typed rows. The
 * custom CSV has two extra trailing columns (`portion_g_cooked`, `note`) which
 * are picked up when present. Header column order is honoured by name.
 */
export function parseFoodCsv(text: string): FoodRow[] {
  const lines = splitCsvRows(text);
  if (lines.length === 0) return [];
  const header = parseCsvLine(lines[0]).map((h) => h.trim());
  const idx = (col: string) => header.indexOf(col);

  const codeI = idx("code");
  const nameI = idx("name");
  const stateI = idx("state");
  const groupI = idx("group");
  const cuisineI = idx("cuisine");
  const bddI = idx("bdd_pct");
  const portionI = idx("portion_g_cooked");
  const noteI = idx("note");
  const aliasI = idx("aliases");

  const rows: FoodRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const code = (cells[codeI] ?? "").trim();
    if (code === "") continue; // skip blank rows defensively
    const name = (cells[nameI] ?? "").trim();

    const nutrients = {} as Record<NutrientKey, number | null>;
    for (const key of NUTRIENT_KEYS) {
      nutrients[key] = numOrNull(cells[idx(key)]);
    }

    const bddRaw = numOrNull(cells[bddI]);
    rows.push({
      code,
      name,
      nameNormalized: normalizeName(name),
      state: (cells[stateI] ?? "").trim() || null,
      foodGroup: (cells[groupI] ?? "").trim() || null,
      cuisine: cuisineI >= 0 ? (cells[cuisineI] ?? "").trim().toLowerCase() || null : null,
      bddPct: bddRaw == null ? 100 : Math.round(bddRaw),
      portionGCooked: portionI >= 0 ? numOrNull(cells[portionI]) : null,
      aliases: aliasI >= 0 ? (cells[aliasI] ?? "").trim() || null : null,
      note: noteI >= 0 ? (cells[noteI] ?? "").trim() || null : null,
      nutrients,
    });
  }
  return rows;
}
