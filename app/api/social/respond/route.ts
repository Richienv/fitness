// POST /api/social/respond  { followId, accept: boolean }
//
// Accept or decline a follow request. Only the TARGET of the request may
// respond — the where-clause pins followingId to the caller, so someone can
// never accept a request on another person's behalf.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUserId } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

export async function POST(req: Request) {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401, headers: noStore });
    }

    const body = (await req.json().catch(() => null)) as
      | { followId?: unknown; accept?: unknown }
      | null;
    const followId = typeof body?.followId === "string" ? body.followId : "";
    const accept = body?.accept === true;
    if (!followId) {
      return NextResponse.json(
        { ok: false, error: "bad-request", message: "followId required" },
        { status: 400, headers: noStore }
      );
    }

    // Scoped to the caller as the TARGET — this is the authorisation check.
    const row = await db.follow.findFirst({
      where: { id: followId, followingId: userId, status: "PENDING" },
      select: { id: true },
    });
    if (!row) {
      return NextResponse.json(
        { ok: false, error: "not-found", message: "Permintaan nggak ditemukan." },
        { status: 404, headers: noStore }
      );
    }

    await db.follow.update({
      where: { id: row.id },
      data: { status: accept ? "ACCEPTED" : "DECLINED", respondedAt: new Date() },
    });

    return NextResponse.json(
      { ok: true, data: { status: accept ? "ACCEPTED" : "DECLINED" } },
      { headers: noStore }
    );
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "respond-failed", message: (e as Error).message },
      { status: 500, headers: noStore }
    );
  }
}
