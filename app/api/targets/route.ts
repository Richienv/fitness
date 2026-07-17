// POST /api/targets  { kcal, protein }  — save the logged-in user's current
// resolved daily target so the widget (and other devices) can read it.
// GET /api/targets — return it. Session-gated.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUserId } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

export async function GET() {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: noStore });
    }
    const t = await db.userTarget.findUnique({ where: { userId } });
    return NextResponse.json({ ok: true, data: t }, { headers: noStore });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "targets-failed", message: (e as Error).message },
      { status: 500, headers: noStore }
    );
  }
}

export async function POST(req: Request) {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: noStore });
    }
    const body = await req.json().catch(() => null);
    const kcal = Math.round(Number(body?.kcal));
    const protein = Math.round(Number(body?.protein));
    if (!Number.isFinite(kcal) || kcal <= 0 || !Number.isFinite(protein) || protein < 0) {
      return NextResponse.json({ error: "invalid" }, { status: 400, headers: noStore });
    }
    await db.userTarget.upsert({
      where: { userId },
      create: { userId, kcal, protein },
      update: { kcal, protein },
    });
    return NextResponse.json({ ok: true }, { headers: noStore });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "targets-save-failed", message: (e as Error).message },
      { status: 500, headers: noStore }
    );
  }
}
