// GET /api/widget/today?token=<signed>  (or Authorization: Bearer <signed>)
//
// Cookieless, read-only "today's nutrition" for the iOS widget. The token is
// verified in-handler (middleware lets GETs through without the api-key), and
// its userId feeds the same todaySnapshot() aggregator /api/today uses — so the
// widget always agrees with the app (targets: 2200 kcal / 175g protein).

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyWidgetToken } from "@/lib/widgetToken";
import { todaySnapshot } from "@/lib/hermes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Cache-Control": "no-store",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cors });
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    let token = url.searchParams.get("token");
    if (!token) {
      const auth = req.headers.get("authorization") ?? "";
      if (/^Bearer\s+/i.test(auth)) token = auth.replace(/^Bearer\s+/i, "").trim();
    }
    const userId = verifyWidgetToken(token);
    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "unauthorized" },
        { status: 401, headers: cors }
      );
    }

    const snap = await todaySnapshot(userId);
    const c = snap.calories;
    // Personal target priority: the server-saved target (kept fresh by the app,
    // so goal edits reflect with no re-paste) → the URL ?kt=/&pt= baked at setup
    // (fallback for older widgets) → the snapshot default.
    const saved = await db.userTarget.findUnique({ where: { userId } }).catch(() => null);
    const ktRaw = Number(url.searchParams.get("kt"));
    const ptRaw = Number(url.searchParams.get("pt"));
    const kcalTarget =
      saved?.kcal && saved.kcal > 0
        ? saved.kcal
        : Number.isFinite(ktRaw) && ktRaw > 0
          ? Math.round(ktRaw)
          : c.target;
    const proteinTarget =
      saved?.protein && saved.protein > 0
        ? saved.protein
        : Number.isFinite(ptRaw) && ptRaw > 0
          ? Math.round(ptRaw)
          : c.proteinTarget;
    const data = {
      date: snap.date,
      totals: {
        kcal: c.consumed,
        protein: c.protein,
        carbs: c.carbs,
        fat: c.fat,
        sugar: c.sugar,
      },
      targets: { kcal: kcalTarget, protein: proteinTarget, sugar: c.sugarTarget },
      remaining: {
        kcal: kcalTarget - c.consumed,
        protein: proteinTarget - c.protein,
      },
      updatedAt: new Date().toISOString(),
    };
    return NextResponse.json({ ok: true, data }, { headers: cors });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "widget-today-failed", message: (e as Error).message },
      { status: 500, headers: cors }
    );
  }
}
