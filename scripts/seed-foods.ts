// Seed the shared food-composition catalogue from CSV into Neon Postgres.
//
//   npm run seed:foods
//
// Idempotent: upserts on `sourceCode`. Requires DATABASE_URL (not available in
// the CI sandbox — this runs against the provisioned Neon DB on deploy).
//
// NULL vs 0: empty CSV cells are parsed to `null` and stored as NULL. Numeric
// zeros only ever come from a literal "0" in the source. See scripts/foodCsv.ts.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { Prisma, PrismaClient, type FoodSource } from "@prisma/client";
import {
  parseFoodCsv,
  clampCopper,
  atwaterCheck,
  NUTRIENT_KEYS,
  type FoodRow,
} from "./foodCsv.ts";
import {
  buildSearchText,
  computePopularity,
  extractNameEn,
} from "./foodRanking.ts";

const db = new PrismaClient();

const DATA_DIR = join(process.cwd(), "data");

// ─── Serving conventions ───────────────────────────────────────────────────
// EDITABLE household-measure defaults. These are NOT from the composition CSV —
// they are conventional serving sizes seeded for convenience. Matching is by
// substring against the normalized name. Keep this list small and obvious.
const SERVING_CONVENTIONS: { match: string; label: string; grams: number }[] = [
  { match: "sate", label: "1 tusuk", grams: 15 },
  { match: "nasi", label: "1 porsi", grams: 150 },
  { match: "gado", label: "1 porsi", grams: 250 },
  { match: "telur", label: "1 butir", grams: 55 },
];

interface SeedTask {
  file: string;
  source: FoodSource;
  prefix: string;
}

const TASKS: SeedTask[] = [
  { file: "tkpi_2019_full.csv", source: "TKPI", prefix: "TKPI:" },
  { file: "custom_foods.csv", source: "CUSTOM", prefix: "CUSTOM:" },
  { file: "desserts.csv", source: "CUSTOM", prefix: "DESSERT:" },
  { file: "r2fit_library.csv", source: "CUSTOM", prefix: "R2LIB:" },
  { file: "drinks.csv", source: "CUSTOM", prefix: "DRINK:" },
  { file: "cafe_foods.csv", source: "CUSTOM", prefix: "CAFE:" },
  { file: "fruits.csv", source: "CUSTOM", prefix: "FRUIT:" },
  // Curated prepared-dish pack, cuisine-tagged (padang / chinese / japanese …).
  { file: "masakan_pack.csv", source: "CUSTOM", prefix: "MASAK:" },
  // Regional dishes the catalogue was missing entirely — Bali, Manado,
  // Sulawesi, Aceh, Medan, Palembang, Kalimantan, Maluku, NTT.
  { file: "pack_nusantara.csv", source: "CUSTOM", prefix: "NUS:" },
  // Street food, kue basah, kerupuk, sambal — and the raw staples (nasi,
  // minyak, cabai, ikan, telur) the ingredient composer builds a plate from.
  { file: "pack_jajanan_bahan.csv", source: "CUSTOM", prefix: "JJN:" },
  // The plain, generic staples. "Ayam Goreng" did not exist as a row — only
  // "Ayam Goreng Mentega", "Ayam Goreng Korea" and so on — so the single most
  // ordinary thing a user types matched nothing exactly.
  { file: "pack_staples.csv", source: "CUSTOM", prefix: "STAPLE:" },
  // Warung and kaki-lima dishes a coverage probe found missing: soto mie,
  // kerak telor, bakso malang, mie tek-tek, tengkleng, timlo, jamu, es doger.
  { file: "pack_warung.csv", source: "CUSTOM", prefix: "WARUNG:" },
  // The last gaps the probe reported: soto lamongan, garang asem, mangut lele,
  // oseng mercon, tahu gejrot, mie kocok, kupat tahu, laksa bogor.
  { file: "pack_jawa.csv", source: "CUSTOM", prefix: "JAWA:" },
  // Donated Indonesian food database v1.0 — 1337 rows after reconciliation,
  // keyed on its own stable slug. Seeds LAST so nothing else can overwrite it;
  // rows it supersedes were removed from the packs above rather than left to
  // lose an upsert race silently (see #134 for what that costs).
  { file: "pack_idn_v1.csv", source: "CUSTOM", prefix: "IDN:" },
  // Optional — skipped silently if the file is absent.
  { file: "usda_foods.csv", source: "USDA", prefix: "USDA:" },
];

function toDecimal(x: number | null): Prisma.Decimal | null {
  return x == null ? null : new Prisma.Decimal(x);
}

async function main() {
  // Parse every source file up front so we know the expected total row count.
  // A task file that is absent is fatal (except the optional USDA one).
  const parsed: { task: SeedTask; rows: FoodRow[] }[] = [];
  for (const task of TASKS) {
    const path = join(DATA_DIR, task.file);
    if (!existsSync(path)) {
      if (task.source === "USDA") {
        console.log(`ℹ  ${task.file} not present — skipping USDA import.`);
        continue;
      }
      throw new Error(`Required data file missing: ${path}`);
    }
    parsed.push({ task, rows: parseFoodCsv(readFileSync(path, "utf8")) });
  }
  const total = parsed.reduce((n, p) => n + p.rows.length, 0);

  // Safe to run on every deploy: bail out if the DB isn't reachable (e.g. a
  // build with no DATABASE_URL). Skip only when the table already holds at
  // least as many rows as our sources define — so adding new foods (e.g. a new
  // desserts CSV) re-seeds automatically on the next deploy. Upserts are
  // idempotent; SEED_FORCE=1 always re-seeds regardless of counts.
  // Bump RANKING_VERSION whenever scripts/foodRanking scoring changes so a
  // deploy that adds no new rows still re-seeds once to recompute popularity /
  // searchText. Tracked via an ActivityLog marker.
  const RANKING_VERSION = 3;
  let rankingStale = false;
  let existing: number | null = null;
  let missingIndex = 0;
  try {
    existing = await db.food.count();
    const lastRanking = await db.activityLog
      .findFirst({ where: { action: "seed:ranking" }, orderBy: { createdAt: "desc" } })
      .catch(() => null);
    const seenVersion = (lastRanking?.payload as { version?: number } | null)?.version;
    rankingStale = seenVersion !== RANKING_VERSION;
    // Rows with an empty searchText haven't been indexed yet (new column, or a
    // ranking-logic change). Rows whose note carries an English name but whose
    // nameEn is still null need the bilingual backfill. Either forces a re-seed.
    missingIndex =
      (await db.food.count({ where: { searchText: "" } })) +
      (await db.food.count({
        where: { nameEn: null, note: { contains: "conf:" } },
      }));
  } catch {
    console.log("ℹ  Food DB not reachable (no DATABASE_URL?) — skipping seed.");
    return;
  }
  if (existing >= total && missingIndex === 0 && !rankingStale && !process.env.SEED_FORCE) {
    console.log(
      `ℹ  Food table already has ${existing} rows (≥ ${total} defined) and is fully indexed — skipping seed (set SEED_FORCE=1 to re-seed).`
    );
    return;
  }
  if (existing > 0) {
    const why =
      missingIndex > 0
        ? `${missingIndex} rows need (re)indexing`
        : rankingStale
          ? `ranking logic v${RANKING_VERSION}`
          : `sources define ${total}`;
    console.log(
      `ℹ  Food table has ${existing} rows, ${why} — re-seeding (idempotent upserts).`
    );
  }

  const counts: Record<string, number> = {};
  let copperClamped = 0;
  let atwaterFlags = 0;
  const atwaterRows: string[] = [];

  for (const { task, rows } of parsed) {
    counts[task.source] = (counts[task.source] ?? 0) + rows.length;

    for (const row of rows) {
      // Clamp copper before persisting; log every affected row.
      const rawCopper = row.nutrients.copper_mg;
      const clampedCopper = clampCopper(rawCopper);
      if (rawCopper != null && clampedCopper == null) {
        copperClamped++;
        console.warn(
          `⚠  copper clamp: ${task.prefix}${row.code} copper_mg=${rawCopper} → NULL (implausible, data-entry error)`
        );
      }

      // Atwater sanity — keep the declared value, only warn.
      const flag = atwaterCheck({
        code: `${task.prefix}${row.code}`,
        energy_kcal: row.nutrients.energy_kcal,
        protein_g: row.nutrients.protein_g,
        fat_g: row.nutrients.fat_g,
        carb_g: row.nutrients.carb_g,
      });
      if (flag) {
        atwaterFlags++;
        atwaterRows.push(
          `${flag.code}: declared ${flag.declared} vs computed ${flag.computed} kcal (${flag.diffPct}%)`
        );
        console.warn(
          `⚠  Atwater: ${flag.code} declared ${flag.declared} vs computed ${flag.computed} kcal (${flag.diffPct}% off) — keeping declared`
        );
      }

      const sourceCode = `${task.prefix}${row.code}`;

      // Build the nutrient decimal map, substituting the clamped copper.
      const nutrientData: Record<string, Prisma.Decimal | null> = {};
      for (const key of NUTRIENT_KEYS) {
        const v = key === "copper_mg" ? clampedCopper : row.nutrients[key];
        nutrientData[key] = toDecimal(v);
      }

      const data = {
        source: task.source,
        name: row.name,
        nameNormalized: row.nameNormalized,
        state: row.state,
        foodGroup: row.foodGroup,
        cuisine: row.cuisine,
        bddPct: row.bddPct,
        portionGCooked: toDecimal(row.portionGCooked),
        note: row.note,
        nameEn: extractNameEn(row),
        aliases: row.aliases,
        // Persisted search index (see scripts/foodRanking.ts).
        searchText: buildSearchText(row),
        popularity: computePopularity(row, task.source),
        ...nutrientData,
      };

      const food = await db.food.upsert({
        where: { sourceCode },
        create: { sourceCode, ...data },
        update: data,
      });

      await seedServings(food.id, row);
    }
  }

  // ─── pg_trgm + GIN index (best-effort) ────────────────────────────────────
  try {
    await db.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS pg_trgm;`);
    await db.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS food_name_trgm ON "Food" USING gin (lower("nameNormalized") gin_trgm_ops);`
    );
    await db.$executeRawUnsafe(
      `CREATE INDEX IF NOT EXISTS food_searchtext_trgm ON "Food" USING gin (lower("searchText") gin_trgm_ops);`
    );
    console.log("✓ pg_trgm extension + food name/searchText GIN indexes ensured.");
  } catch (e) {
    console.warn(
      `⚠  Could not create pg_trgm extension / index (search will still work via ILIKE): ${(e as Error).message}`
    );
  }

  // ─── Summary ──────────────────────────────────────────────────────────────
  console.log("\n─── Seed summary ───");
  for (const [source, n] of Object.entries(counts)) {
    console.log(`  ${source}: ${n} foods`);
  }
  console.log(`  Copper clamped (→ NULL): ${copperClamped}`);
  console.log(`  Atwater warnings: ${atwaterFlags}`);
  if (atwaterRows.length > 0) {
    console.log("  Atwater flagged rows:");
    for (const r of atwaterRows) console.log(`    - ${r}`);
  }

  // Record the ranking version we just seeded, so the next deploy only re-seeds
  // for ranking changes when RANKING_VERSION is bumped again.
  await db.activityLog
    .create({ data: { actor: "seed", action: "seed:ranking", payload: { version: RANKING_VERSION } } })
    .catch(() => {});
}

/**
 * Seed FoodServing rows for a food. Custom foods get a "1 porsi" serving from
 * their portionGCooked; all foods get any matching SERVING_CONVENTIONS entry.
 * Idempotent: clears this food's servings first, then re-inserts.
 */
async function seedServings(foodId: string, row: FoodRow) {
  const servings: { label: string; grams: number }[] = [];

  if (row.portionGCooked != null) {
    servings.push({ label: "1 porsi", grams: row.portionGCooked });
  }

  for (const conv of SERVING_CONVENTIONS) {
    if (row.nameNormalized.includes(conv.match)) {
      // Avoid duplicate labels (e.g. custom "1 porsi" already added).
      if (!servings.some((s) => s.label === conv.label)) {
        servings.push({ label: conv.label, grams: conv.grams });
      }
    }
  }

  if (servings.length === 0) return;

  await db.foodServing.deleteMany({ where: { foodId } });
  await db.foodServing.createMany({
    data: servings.map((s) => ({
      foodId,
      label: s.label,
      grams: new Prisma.Decimal(s.grams),
    })),
  });
}

main()
  .then(async () => {
    await db.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });
