// POST /api/social/unfollow  { userId }  — stop being friends.
//
// Friendship is mutual, so ending it is too: both rows go, whichever direction
// they were created in. There is no half-friendship to leave behind, and a
// surviving row would keep one of you visible to the other.
//
// The legacy `mode` field is accepted and ignored — it drew a distinction
// ("unfollow" vs "remove") that no longer exists.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUserId } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

export async function POST(req: Request) {
  try {
    const me = await getUserId();
    if (!me) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401, headers: noStore });
    }

    const body = (await req.json().catch(() => null)) as { userId?: unknown } | null;
    const other = typeof body?.userId === "string" ? body.userId : "";
    if (!other) {
      return NextResponse.json(
        { ok: false, error: "bad-request", message: "userId required" },
        { status: 400, headers: noStore }
      );
    }

    const { count } = await db.follow.deleteMany({
      where: {
        OR: [
          { followerId: me, followingId: other },
          { followerId: other, followingId: me },
        ],
      },
    });

    return NextResponse.json({ ok: true, data: { removed: count } }, { headers: noStore });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "unfollow-failed", message: (e as Error).message },
      { status: 500, headers: noStore }
    );
  }
}
