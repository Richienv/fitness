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
    const raw = new URL(req.url).searchParams.get("date") ?? "";
    const date = DATE_RE.test(raw) ? raw : todayKey();
    const rows = await db.cardioSession.findMany({
      where: { userId, date },
      orderBy: { startedAt: "asc" },
      select: { id: true, kind: true, distanceM: true, durationSec: true, location: true },
    });
    return NextResponse.json({ ok: true, data: { date, sessions: rows } }, { headers: noStore });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "cardio-failed", message: (e as Error).message },
      { status: 500, headers: noStore }
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
