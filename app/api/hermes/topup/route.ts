import { NextResponse } from "next/server";
import { getHermesOwnerId } from "@/lib/session";
import {
  DAILY_PROTEIN_TARGET,
  microTotalsFor,
  todaySnapshot,
} from "@/lib/hermes";
import { DEFAULT_MICRO_TARGETS } from "@/lib/nutritionTargets";
import { bestTopUps, type Gap, type SuggestionKey } from "@/lib/nutrientSuggest";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

/**
 * GET /api/hermes/topup
 * Returns the top-3 library foods that would close TODAY's unmet hit-nutrient
 * gaps most efficiently per kcal. Used by Ren when the user says "what
 * should I eat to round out the day".
 *
 * Optional ?limit=N (default 3).
 */
export async function GET(req: Request) {
  try {
    const userId = await getHermesOwnerId();
    if (!userId)
      return NextResponse.json(
        { error: "hermes owner not configured" },
        { status: 503, headers: corsHeaders }
      );
    const url = new URL(req.url);
    const limit = Math.max(1, Math.min(6, Number(url.searchParams.get("limit") ?? 3)));

    const today = await todaySnapshot(userId);
    const micros = await microTotalsFor(userId, today.date);

    const protein = today.calories.protein;
    const proteinTarget = today.calories.proteinTarget ?? DAILY_PROTEIN_TARGET;
    const targets = DEFAULT_MICRO_TARGETS;

    const gaps: Gap[] = [];
    if (protein < proteinTarget) {
      gaps.push({ key: "protein" as SuggestionKey, gap: proteinTarget - protein, target: proteinTarget });
    }
    const pairs: Array<[SuggestionKey, number]> = [
      ["fiber",  micros.fiber],
      ["omega3", micros.omega3],
      ["k",      micros.k],
      ["mg",     micros.mg],
      ["fe",     micros.fe],
      ["zn",     micros.zn],
      ["ca",     micros.ca],
    ];
    for (const [key, value] of pairs) {
      const tgt = targets[key as keyof typeof targets];
      if (value < tgt) gaps.push({ key, gap: tgt - value, target: tgt });
    }

    const picks = bestTopUps(gaps, { limit });

    return NextResponse.json(
      {
        ok: true,
        data: {
          date: today.date,
          gapsCount: gaps.length,
          gaps: gaps.map((g) => ({ key: g.key, gap: Math.round(g.gap * 10) / 10, target: g.target })),
          picks,
          bonusTags: micros.tags,
        },
      },
      { headers: corsHeaders }
    );
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "topup-failed", message: (e as Error).message },
      { status: 500, headers: corsHeaders }
    );
  }
}
