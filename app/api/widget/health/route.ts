// POST /api/widget/health   Authorization: Bearer <health token>
//   Body (JSON, from an iPhone Shortcut): { steps, activeKcal, distanceKm?, date? }
//   Indonesian keys work too (langkah, kalori_aktif, jarak_km, tanggal), and
//   numbers may arrive as text in either locale ("6.200", "410,5").
// GET  /api/widget/health?from=YYYY-MM-DD   (session cookie)
//   The signed-in user's imported days, newest value per date.
//
// The home-screen app is a PWA and cannot read HealthKit; a Shortcut can, and
// posts here once a day. Stored in the existing ActivityLog table (action
// "health.day", entityId = date), so no schema change. /api/widget is a public
// prefix in middleware; the token or the session is checked here.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUserId } from "@/lib/session";
import { verifyHealthToken } from "@/lib/widgetToken";
import { todayKey } from "@/lib/targets";
import { parseHealthPayload, type HealthDay } from "@/lib/healthImport";
import { notifyPartnerActivity } from "@/lib/partnerNotify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ACTION = "health.day";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Cache-Control": "no-store",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cors });
}

const fmt = (n: number) => Math.round(n).toLocaleString("id-ID");

export async function POST(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const token = /^Bearer\s+/i.test(auth)
    ? auth.replace(/^Bearer\s+/i, "").trim()
    : new URL(req.url).searchParams.get("token");
  const userId = verifyHealthToken(token);
  if (!userId)
    return NextResponse.json(
      { ok: false, error: "unauthorized", message: "Token tidak valid. Salin token baru dari R2·FIT." },
      { status: 401, headers: cors },
    );
  const body = await req.json().catch(() => null);
  const parsed = parseHealthPayload(body, todayKey());
  if (!parsed.ok)
    return NextResponse.json(
      { ok: false, error: "invalid", message: parsed.error },
      { status: 400, headers: cors },
    );
  const day = parsed.day;
  try {
    const payload = { ...day, receivedAt: new Date().toISOString() };
    const existing = await db.activityLog.findFirst({
      where: { actor: userId, action: ACTION, entityId: day.date },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (existing)
      await db.activityLog.update({ where: { id: existing.id }, data: { payload } });
    else
      await db.activityLog.create({
        data: { actor: userId, action: ACTION, entityType: "health", entityId: day.date, payload },
      });
    if (day.date === todayKey() && day.steps !== null && day.steps >= 5000) {
      const milestone =
        day.steps >= 10000 ? 10000 : day.steps >= 8000 ? 8000 : 5000;
      void notifyPartnerActivity(userId, {
        type: "steps",
        steps: day.steps,
        milestone,
        date: day.date,
      });
    }
    const parts = [
      day.steps !== null ? `${fmt(day.steps)} langkah` : null,
      day.activeKcal !== null ? `${fmt(day.activeKcal)} kkal aktif` : null,
    ].filter(Boolean);
    return NextResponse.json(
      { ok: true, data: day, message: `Terkirim ke R2·FIT: ${parts.join(" · ")}` },
      { headers: cors },
    );
  } catch (e) {
    console.error("health import failed", e);
    return NextResponse.json(
      { ok: false, error: "save-failed", message: "Data belum tersimpan. Coba lagi nanti." },
      { status: 500, headers: cors },
    );
  }
}

export async function GET(req: Request) {
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401, headers: cors });
  const from = new URL(req.url).searchParams.get("from") ?? "0000-00-00";
  try {
    const rows = await db.activityLog.findMany({
      where: { actor: userId, action: ACTION, entityId: { gte: from } },
      orderBy: { createdAt: "desc" },
      select: { entityId: true, payload: true },
      take: 400,
    });
    const days = new Map<string, HealthDay & { receivedAt?: string }>();
    for (const r of rows) {
      if (!r.entityId || days.has(r.entityId)) continue;
      days.set(r.entityId, r.payload as HealthDay & { receivedAt?: string });
    }
    return NextResponse.json(
      { ok: true, data: { days: [...days.values()] } },
      { headers: cors },
    );
  } catch (e) {
    console.error("health read failed", e);
    return NextResponse.json(
      { ok: false, error: "read-failed" },
      { status: 500, headers: cors },
    );
  }
}
