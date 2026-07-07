# Food-composition data sources

This directory holds the source CSVs for the shared food-composition catalogue
(`Food` / `FoodServing` in `prisma/schema.prisma`, seeded by
`scripts/seed-foods.ts`). All nutrient values are **per 100 g edible portion**.

## Sources

| File | Source | Rows | Notes |
|------|--------|------|-------|
| `tkpi_2019_full.csv` | **TKPI 2019** — Tabel Komposisi Pangan Indonesia, Kementerian Kesehatan RI (Kemenkes RI) | 1,148 | Official Indonesian food-composition table. Stored with `source = TKPI`, `sourceCode = "TKPI:<code>"`. |
| `custom_foods.csv` | **Custom composites** — Richie's own recipes / estimates | 6 | Home-recipe estimates (e.g. salad hambug, siomay, sate). `source = CUSTOM`, `sourceCode = "CUSTOM:<code>"`. Each carries `portion_g_cooked` and a `note` describing the assumptions. |
| `usda_foods.csv` *(optional)* | **USDA FoodData Central (FDC)** | — | Not currently present. If added, seeded as `source = USDA`, `sourceCode = "USDA:<code>"`; the seed skips it silently when absent. |

## Data conventions & caveats

- **Per 100 g edible-portion basis.** Values are for the edible portion; the
  `bdd_pct` column (Bagian Dapat Dimakan) records that edible percentage
  (default 100).
- **NULL ≠ 0.** An empty CSV cell means "not measured / unknown" and is stored
  as `NULL`, never `0`. A numeric `0` only ever comes from a literal `0` in the
  source. Downstream display helpers (`lib/foodComposition.ts`) propagate
  `null` strictly so unknown values never masquerade as zero.
- **Copper clamp.** TKPI contains data-entry errors where `copper_mg` is
  implausibly large (µg mistakenly recorded as mg). The seed clamps any
  `copper_mg > 20` to `NULL` and logs every affected row (18 rows in the 2019
  set).
- **Atwater sanity check.** The seed compares declared `energy_kcal` against
  `4·protein + 9·fat + 4·carb`; when they differ by more than 30 % of the
  declared value it logs a warning but **keeps the declared value** (23 TKPI
  rows flagged). No nutrient value is ever fabricated or overwritten.
- **Serving sizes are conventions, not source data.** `FoodServing` rows
  (household measures like "1 tusuk" / "1 porsi") come from an editable
  `SERVING_CONVENTIONS` list in the seed and from each custom food's
  `portion_g_cooked` — they are NOT part of the composition tables.

## Attribution

Nutrient data: **TKPI 2019 (Kemenkes RI)** for TKPI rows; **custom composite
estimates (Richie's recipes)** for CF rows; **USDA FoodData Central** optional.
