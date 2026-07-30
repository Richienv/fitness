// GET /api/social — the viewer's whole social state in one call:
//   friends          (accepted, in EITHER direction — the list the UI shows)
//   incoming         (pending requests waiting on MY accept/decline)
//   outgoing         (pending requests I sent, waiting on them)
//   following        (accepted rows I created)   ─┐ kept for debugging; the UI
//   followers        (accepted rows aimed at me) ─┘ shouldn't need either
//
// `friends` is the union of the last two. Friendship is mutual, so who happened
// to send the request is a detail of how the row was written, not a distinction
// worth showing anyone — and splitting them is what hid accepted friends from
// the person who accepted them.
//
// Session-gated. Only ever returns rows that involve the caller.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUserId } from "@/lib/session";
import { displayName, publicUser } from "@/lib/social";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

const SELECT_USER = { id: true, name: true, username: true, email: true } as const;

export async function GET() {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401, headers: noStore });
    }

    const [asFollower, asTarget] = await Promise.all([
      db.follow.findMany({
        where: { followerId: userId, status: { in: ["PENDING", "ACCEPTED"] } },
        select: { id: true, status: true, createdAt: true, respondedAt: true, following: { select: SELECT_USER } },
        orderBy: { createdAt: "desc" },
      }),
      db.follow.findMany({
        where: { followingId: userId, status: { in: ["PENDING", "ACCEPTED"] } },
        select: { id: true, status: true, createdAt: true, respondedAt: true, follower: { select: SELECT_USER } },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const shape = (
      id: string,
      u: { id: string; name: string | null; username: string | null; email: string },
      since: Date
    ) => ({
      followId: id,
      user: publicUser(u),
      name: displayName(u),
      // When you became friends — the "history" half of the friend list.
      since: since.toISOString(),
    });

    const following = asFollower
      .filter((r) => r.status === "ACCEPTED")
      .map((r) => shape(r.id, r.following, r.respondedAt ?? r.createdAt));
    const followers = asTarget
      .filter((r) => r.status === "ACCEPTED")
      .map((r) => shape(r.id, r.follower, r.respondedAt ?? r.createdAt));

    // Dedupe by user id — a pair could hold a row in each direction if they
    // both sent a request before either accepted.
    const byUser = new Map<string, (typeof following)[number]>();
    for (const p of [...following, ...followers]) {
      const prev = byUser.get(p.user.id);
      if (!prev || p.since < prev.since) byUser.set(p.user.id, p);
    }
    const friends = Array.from(byUser.values()).sort((a, b) =>
      a.name.localeCompare(b.name, "id")
    );

    return NextResponse.json(
      {
        ok: true,
        data: {
          friends,
          incoming: asTarget
            .filter((r) => r.status === "PENDING")
            .map((r) => shape(r.id, r.follower, r.createdAt)),
          outgoing: asFollower
            .filter((r) => r.status === "PENDING")
            .map((r) => shape(r.id, r.following, r.createdAt)),
          following,
          followers,
        },
      },
      { headers: noStore }
    );
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "social-failed", message: (e as Error).message },
      { status: 500, headers: noStore }
    );
  }
}
