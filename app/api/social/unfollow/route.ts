// POST /api/social/unfollow  { userId, mode?: "unfollow" | "remove" }
//
//   unfollow (default) — I stop following THEM  (deletes follower=me row)
//   remove             — I revoke THEIR access to me (deletes following=me row)
//
// Either way the row is deleted, so access ends immediately: every feed read
// requires an ACCEPTED row to exist.

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

    const body = (await req.json().catch(() => null)) as
      | { userId?: unknown; mode?: unknown }
      | null;
    const other = typeof body?.userId === "string" ? body.userId : "";
    const mode = body?.mode === "remove" ? "remove" : "unfollow";
    if (!other) {
      return NextResponse.json(
        { ok: false, error: "bad-request", message: "userId required" },
        { status: 400, headers: noStore }
      );
    }

    const where =
      mode === "remove"
        ? { followerId_followingId: { followerId: other, followingId: me } }
        : { followerId_followingId: { followerId: me, followingId: other } };

    await db.follow.deleteMany({ where: where.followerId_followingId });

    return NextResponse.json({ ok: true, data: { mode } }, { headers: noStore });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "unfollow-failed", message: (e as Error).message },
      { status: 500, headers: noStore }
    );
  }
}
