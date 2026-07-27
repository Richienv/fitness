// GET /api/social — the viewer's whole social state in one call:
//   following        (accepted, people whose day I can see)
//   followers        (accepted, people who can see my day)
//   incoming         (pending requests waiting on MY accept/decline)
//   outgoing         (pending requests I sent, waiting on them)
//
// Session-gated. Only ever returns rows that involve the caller.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUserId } from "@/lib/session";
import { displayName, publicUser } from "@/lib/social";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

const SELECT_USER = { id: true, name: true, email: true } as const;

export async function GET() {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401, headers: noStore });
    }

    const [asFollower, asTarget] = await Promise.all([
      db.follow.findMany({
        where: { followerId: userId, status: { in: ["PENDING", "ACCEPTED"] } },
        select: { id: true, status: true, createdAt: true, following: { select: SELECT_USER } },
        orderBy: { createdAt: "desc" },
      }),
      db.follow.findMany({
        where: { followingId: userId, status: { in: ["PENDING", "ACCEPTED"] } },
        select: { id: true, status: true, createdAt: true, follower: { select: SELECT_USER } },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const shape = (id: string, u: { id: string; name: string | null; email: string }) => ({
      followId: id,
      user: publicUser(u),
      name: displayName(u),
    });

    return NextResponse.json(
      {
        ok: true,
        data: {
          following: asFollower
            .filter((r) => r.status === "ACCEPTED")
            .map((r) => shape(r.id, r.following)),
          outgoing: asFollower
            .filter((r) => r.status === "PENDING")
            .map((r) => shape(r.id, r.following)),
          followers: asTarget
            .filter((r) => r.status === "ACCEPTED")
            .map((r) => shape(r.id, r.follower)),
          incoming: asTarget
            .filter((r) => r.status === "PENDING")
            .map((r) => shape(r.id, r.follower)),
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
