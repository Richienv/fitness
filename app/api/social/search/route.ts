// GET /api/social/search?q=richie — find people by @username.
//
// Only matches the PUBLIC handle, never email or name, so the endpoint can't
// be used to look someone up by an address they didn't publish. Emails are
// never returned. Requires a query of 2+ chars, so it can't enumerate the
// whole user table, and results are capped.
//
// The response includes the caller's existing relationship to each hit so the
// UI can render "IKUTI" / "MENUNGGU" / "SUDAH" without a second round trip.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUserId } from "@/lib/session";
import { normalizeUsername } from "@/lib/username";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };
const LIMIT = 10;

export async function GET(req: Request) {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401, headers: noStore });
    }

    const q = normalizeUsername(new URL(req.url).searchParams.get("q") ?? "");
    if (q.length < 2) {
      return NextResponse.json({ ok: true, data: { results: [] } }, { headers: noStore });
    }

    const users = await db.user.findMany({
      where: {
        username: { startsWith: q },
        NOT: { id: userId },
      },
      select: { id: true, username: true, name: true },
      take: LIMIT,
      orderBy: { username: "asc" },
    });

    if (users.length === 0) {
      return NextResponse.json({ ok: true, data: { results: [] } }, { headers: noStore });
    }

    // Existing relationship in either direction, so the UI can label the row.
    const rels = await db.follow.findMany({
      where: {
        followerId: userId,
        followingId: { in: users.map((u) => u.id) },
      },
      select: { followingId: true, status: true },
    });
    const byId = new Map(rels.map((r) => [r.followingId, r.status]));

    return NextResponse.json(
      {
        ok: true,
        data: {
          results: users.map((u) => ({
            id: u.id,
            username: u.username,
            name: u.name?.trim() || u.username,
            // null = no relationship yet
            status: byId.get(u.id) ?? null,
          })),
        },
      },
      { headers: noStore }
    );
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "search-failed", message: (e as Error).message },
      { status: 500, headers: noStore }
    );
  }
}
