// Server-only Postgres overlay loader for shared Food rows (e.g., user-contributed
// `USER:` entries or custom imports). Always guarded by try/catch so DB cold starts
// or unpushed schemas never break bundled food catalogue responses.

import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { DbOverlayFood, ServingMeasure } from "./serverFoodCatalogue";

interface DbFoodRow {
  id: string;
  sourceCode: string;
  name: string;
  nameEn: string | null;
  aliases: string | null;
  state: string | null;
  foodGroup: string | null;
  cuisine: string | null;
  portionGCooked: Prisma.Decimal | null;
  energy_kcal: Prisma.Decimal | null;
  protein_g: Prisma.Decimal | null;
  fat_g: Prisma.Decimal | null;
  carb_g: Prisma.Decimal | null;
  sugar_g: Prisma.Decimal | null;
  popularity: Prisma.Decimal | number | null;
}

const num = (x: Prisma.Decimal | number | null | undefined): number | null =>
  x == null ? null : Number(x.toString());

const OVERLAY_TTL_MS = 2 * 60 * 1000;
let overlayCache: { at: number; rows: DbOverlayFood[] } | null = null;

export function invalidateDbFoodOverlayCache(): void {
  overlayCache = null;
}

export async function loadDbFoodOverlay(): Promise<DbOverlayFood[]> {
  if (overlayCache && Date.now() - overlayCache.at < OVERLAY_TTL_MS) {
    return overlayCache.rows;
  }
  try {
    const rows = await db.$queryRaw<DbFoodRow[]>(Prisma.sql`
      SELECT f.id, f."sourceCode", f.name, f."nameEn", f.aliases, f.state,
             f."foodGroup", f.cuisine, f."portionGCooked",
             f.energy_kcal, f.protein_g, f.fat_g, f.carb_g, f.sugar_g, f.popularity
      FROM "Food" f
      WHERE f.energy_kcal IS NOT NULL;
    `);

    const userFoodIds = rows
      .filter((r) => r.sourceCode.startsWith("USER:"))
      .map((r) => r.id);

    const servingsByFood = new Map<string, ServingMeasure[]>();
    if (userFoodIds.length > 0) {
      const sv = await db.foodServing
        .findMany({
          where: { foodId: { in: userFoodIds } },
          select: { foodId: true, label: true, grams: true },
        })
        .catch(() => []);
      for (const s of sv) {
        const list = servingsByFood.get(s.foodId) ?? [];
        list.push({ label: s.label, grams: Number(s.grams.toString()) });
        servingsByFood.set(s.foodId, list);
      }
    }

    const mapped: DbOverlayFood[] = rows.map((r) => ({
      id: r.id,
      sourceCode: r.sourceCode,
      name: r.name,
      nameEn: r.nameEn,
      aliases: r.aliases,
      state: r.state,
      foodGroup: r.foodGroup,
      cuisine: r.cuisine,
      portionG: num(r.portionGCooked),
      servings: servingsByFood.get(r.id) ?? [],
      energy_kcal: num(r.energy_kcal),
      protein_g: num(r.protein_g),
      fat_g: num(r.fat_g),
      carb_g: num(r.carb_g),
      sugar_g: num(r.sugar_g),
      popularity: num(r.popularity),
    }));

    overlayCache = { at: Date.now(), rows: mapped };
    return mapped;
  } catch {
    return [];
  }
}
