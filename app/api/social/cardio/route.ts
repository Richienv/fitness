// POST /api/social/cardio — log a run/walk/swim/ride for YOURSELF.
// GET  /api/social/cardio?date= — your cardio for a day.
//
// Cardio is separate from lifting: it carries distance/duration/place rather
// than sets and reps, and the feed + profile render it in its own card. Without
// this endpoint nothing could ever populate those cards.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUserId } from "@/lib/session";
import { todayKey } from "@/lib/targets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const KINDS = new Set(["lari", "jalan", "renang", "sepeda"]);

export async function GET(req: Request) {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401, headers: noStore });
    }
    const url = new URL(req.url);
    const fromRaw = url.searchParams.get("from") ?? "";
    const dateRaw = url.searchParams.get("date") ?? "";
    const useFrom = DATE_RE.test(fromRaw);
    const date = DATE_RE.test(dateRaw) ? dateRaw : todayKey();
    const rows = await db.cardioSession.findMany({
      where: useFrom ? { userId, date: { gte: fromRaw } } : { userId, date },
      orderBy: { startedAt: "asc" },
      select: {
        id: true,
        date: true,
        kind: true,
        distanceM: true,
        durationSec: true,
        location: true,
        startedAt: true,
      },
    });
    const ids = rows.map((r) => r.id);
    const metaById = new Map<string, { title?: string; intensity?: string; caloriesBurned?: number }>();
    if (ids.length > 0) {
      const logs = await db.activityLog
        .findMany({
          where: {
            actor: "r2fit-mcp",
            entityId: { in: ids },
            action: { in: ["log-workout", "update-workout"] },
          },
          orderBy: { createdAt: "asc" },
        })
        .catch(() => []);
      for (const l of logs) {
        if (!l.entityId || !l.payload || typeof l.payload !== "object") continue;
        const p = l.payload as Record<string, unknown>;
        const prev = metaById.get(l.entityId) ?? {};
        metaById.set(l.entityId, {
          ...prev,
          ...(typeof p.title === "string" ? { title: p.title } : {}),
          ...(typeof p.intensity === "string" ? { intensity: p.intensity } : {}),
          ...(typeof p.calories_burned === "number" ? { caloriesBurned: p.calories_burned } : {}),
        });
      }
    }
    return NextResponse.json(
      {
        ok: true,
        data: {
          ...(useFrom ? { from: fromRaw } : { date }),
          sessions: rows.map((r) => {
            const meta = metaById.get(r.id);
            return {
              id: r.id,
              date: r.date,
              kind: r.kind,
              distanceM: r.distanceM,
              durationSec: r.durationSec,
              location: r.location,
              startedAt: r.startedAt.getTime(),
              ...(meta?.title ? { title: meta.title } : {}),
              ...(meta?.intensity ? { intensity: meta.intensity } : {}),
              ...(typeof meta?.caloriesBurned === "number"
                ? { caloriesBurned: meta.caloriesBurned }
                : {}),
            };
          }),
        },
      },
      { headers: noStore },
    );
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "cardio-failed", message: (e as Error).message },
      { status: 500, headers: noStore }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401, headers: noStore });
    }
    const id = (new URL(req.url).searchParams.get("id") ?? "").trim();
    if (!id) {
      return NextResponse.json({ ok: false, error: "bad-request", message: "id required" }, { status: 400, headers: noStore });
    }
    await db.cardioSession.deleteMany({ where: { id, userId } });
    return NextResponse.json({ ok: true }, { headers: noStore });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "cardio-delete-failed", message: (e as Error).message },
      { status: 500, headers: noStore },
    );
  }
}

export async function POST(req: Request) {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401, headers: noStore });
    }
    const body = (await req.json().catch(() => null)) as {
      kind?: unknown; distanceKm?: unknown; durationMin?: unknown; location?: unknown; date?: unknown;
    } | null;

    const kind = typeof body?.kind === "string" ? body.kind.toLowerCase() : "";
    if (!KINDS.has(kind)) {
      return NextResponse.json(
        { ok: false, error: "bad-request", message: "Jenis harus lari / jalan / renang / sepeda." },
        { status: 400, headers: noStore }
      );
    }
    const distanceKm = Number(body?.distanceKm);
    const durationMin = Number(body?.durationMin);
    if (!Number.isFinite(durationMin) || durationMin <= 0) {
      return NextResponse.json(
        { ok: false, error: "bad-request", message: "Durasi harus lebih dari 0 menit." },
        { status: 400, headers: noStore }
      );
    }
    const rawDate = typeof body?.date === "string" ? body.date : "";
    const date = DATE_RE.test(rawDate) ? rawDate : todayKey();
    const location = typeof body?.location === "string" ? body.location.trim().slice(0, 60) || null : null;

    const row = await db.cardioSession.create({
      data: {
        userId,
        date,
        kind,
        distanceM: Number.isFinite(distanceKm) && distanceKm > 0 ? distanceKm * 1000 : null,
        durationSec: Math.round(durationMin * 60),
        location,
      },
      select: { id: true },
    });

    return NextResponse.json({ ok: true, data: { id: row.id } }, { headers: noStore });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "cardio-failed", message: (e as Error).message },
      { status: 500, headers: noStore }
    );
  }
}
