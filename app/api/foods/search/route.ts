// GET /api/foods/search?q=...&group=...
//
// Searches the hybrid bundled CSV + DB food catalogue using lib/foodSearch.ts
// + lib/foodAliases.ts so newly shipped packs are immediately searchable on
// Vercel even before DB re-seeding, and DB errors never 500 search.

import { NextResponse } from "next/server";
import { getUserId } from "@/lib/session";
import { searchHybridFoods } from "@/lib/serverFoodCatalogue";
import { loadDbFoodOverlay } from "@/lib/serverFoodDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-api-key, x-actor",
  "Cache-Control": "no-store",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function GET(req: Request) {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json(
        { error: "unauthorized" },
        { status: 401, headers: corsHeaders }
      );
    }

    const url = new URL(req.url);
    const raw = url.searchParams.get("q") ?? "";
    const groupKey = url.searchParams.get("group") ?? "";

    const foods = await searchHybridFoods({
      query: raw,
      groupKey: groupKey || undefined,
      loadDb: loadDbFoodOverlay,
    });

    return NextResponse.json(
      { ok: true, data: { foods } },
      { headers: corsHeaders }
    );
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "food-search-failed", message: (e as Error).message },
      { status: 500, headers: corsHeaders }
    );
  }
}
