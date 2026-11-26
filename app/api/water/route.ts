import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getUserId } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const corsHeaders = { "Cache-Control": "no-store" };
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_WATER_ML = 10_000;

export async function GET(req: Request) {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401, headers: corsHeaders });
    }
    const url = new URL(req.url);
    const from = url.searchParams.get("from");
    const rows = await db.dailyLog.findMany({
      where: from && DATE_RE.test(from) ? { userId, date: { gte: from } } : { userId },
      orderBy: { date: "asc" },
      select: { date: true, checklist: true },
    });

    const days: Array<{ date: string; waterMl: number }> = [];
    for (const r of rows) {
      const c = r.checklist as Record<string, unknown> | null;
      const w = typeof c?.waterMl === "number" && Number.isFinite(c.waterMl) ? Math.round(c.waterMl) : 0;
      if (w > 0) {
        days.push({ date: r.date, waterMl: Math.min(MAX_WATER_ML, Math.max(0, w)) });
      }
    }

    return NextResponse.json({ ok: true, data: { days } }, { headers: corsHeaders });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "water-query-failed", message: (e as Error).message },
      { status: 500, headers: corsHeaders },
    );
  }
}

export async function POST(req: Request) {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401, headers: corsHeaders });
    }
    const body = (await req.json().catch(() => null)) as {
      date?: unknown;
      waterMl?: unknown;
    } | null;

    if (!body || typeof body.date !== "string" || !DATE_RE.test(body.date)) {
      return NextResponse.json({ ok: false, error: "invalid-date" }, { status: 400, headers: corsHeaders });
    }
    const rawWater = Number(body.waterMl);
    if (!Number.isFinite(rawWater) || rawWater < 0) {
      return NextResponse.json({ ok: false, error: "invalid-water" }, { status: 400, headers: corsHeaders });
    }
    const waterMl = Math.min(MAX_WATER_ML, Math.max(0, Math.round(rawWater)));

    const existing = await db.dailyLog.findUnique({
      where: { userId_date: { userId, date: body.date } },
      select: { id: true, checklist: true },
    });

    const prevChecklist =
      existing?.checklist && typeof existing.checklist === "object" && !Array.isArray(existing.checklist)
        ? (existing.checklist as Record<string, unknown>)
        : {};

    const nextChecklist = {
      ...prevChecklist,
      waterMl,
      waterUpdatedAt: new Date().toISOString(),
    };

    await db.dailyLog.upsert({
      where: { userId_date: { userId, date: body.date } },
      create: {
        userId,
        date: body.date,
        gymDay: false,
        checklist: nextChecklist as Prisma.InputJsonValue,
      },
      update: {
        checklist: nextChecklist as Prisma.InputJsonValue,
      },
    });

    return NextResponse.json(
      { ok: true, data: { date: body.date, waterMl } },
      { headers: corsHeaders },
    );
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "water-save-failed", message: (e as Error).message },
      { status: 500, headers: corsHeaders },
    );
  }
}
