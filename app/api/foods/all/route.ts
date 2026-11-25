// GET /api/foods/all
//
// Returns the ENTIRE shared food catalogue (bundled CSV packs merged with any
// DB-contributed rows), cached in-process so Vercel deploys never lag behind
// database re-seeds and DB cold starts never break catalogue loading.

import { NextResponse } from "next/server";
import { getUserId } from "@/lib/session";
import { getHybridFoodCatalogue } from "@/lib/serverFoodCatalogue";
import { loadDbFoodOverlay } from "@/lib/serverFoodDb";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-api-key",
  "Cache-Control": "no-store",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function GET() {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: corsHeaders });
    }

    const foods = await getHybridFoodCatalogue({ loadDb: loadDbFoodOverlay });
    return NextResponse.json({ ok: true, data: { foods } }, { headers: corsHeaders });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "food-all-failed", message: (e as Error).message },
      { status: 500, headers: corsHeaders }
    );
  }
}
