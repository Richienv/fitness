// GET /api/social/presence
//
// Returns:
//   - partners: accepted Follow friends (for the Home Door button & picker)
//   - activeVisitors: accepted friends currently inside your room (last ~45s)
//   - recentNudges: sweet knocks/nudges sent by accepted friends in the last 6h
// Degrades gracefully if RoomVisit hasn't been pushed to the DB yet.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUserId } from "@/lib/session";
import {
  displayName,
  friendIds,
  isMissingRelationError,
  publicUser,
} from "@/lib/social";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };
const ACTIVE_WINDOW_MS = 45_000;
const NUDGE_WINDOW_MS = 6 * 3600_000;

export async function GET() {
  try {
    const viewerId = await getUserId();
    if (!viewerId) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401, headers: noStore });
    }

    const friends = await friendIds(viewerId);
    const friendUsers = friends.length
      ? await db.user.findMany({
          where: { id: { in: friends } },
          select: { id: true, name: true, username: true, email: true },
          orderBy: { createdAt: "asc" },
        })
      : [];

    const partners = friendUsers.map((u) => ({
      ...publicUser(u),
      displayName: displayName(u),
    }));

    if (friends.length === 0) {
      return NextResponse.json(
        {
          ok: true,
          data: {
            partners: [],
            activeVisitors: [],
            recentNudges: [],
          },
        },
        { headers: noStore }
      );
    }

    const now = Date.now();
    const activeSince = new Date(now - ACTIVE_WINDOW_MS);
    const nudgeSince = new Date(now - NUDGE_WINDOW_MS);

    let degraded = false;
    let rows: {
      visitorId: string;
      lastSeenAt: Date;
      nudgeText: string | null;
      nudgeAt: Date | null;
      visitor: { id: string; name: string | null; username: string | null; email: string };
    }[] = [];

    try {
      rows = await db.roomVisit.findMany({
        where: {
          hostId: viewerId,
          visitorId: { in: friends },
          OR: [
            { lastSeenAt: { gte: activeSince } },
            { nudgeAt: { gte: nudgeSince } },
          ],
        },
        include: {
          visitor: {
            select: { id: true, name: true, username: true, email: true },
          },
        },
        orderBy: [{ lastSeenAt: "desc" }],
      });
    } catch (err) {
      if (isMissingRelationError(err)) {
        degraded = true;
      } else {
        throw err;
      }
    }

    const activeVisitors = rows
      .filter((r) => r.lastSeenAt >= activeSince)
      .map((r) => ({
        user: publicUser(r.visitor),
        name: displayName(r.visitor),
        lastSeenAt: r.lastSeenAt.toISOString(),
        nudgeText:
          r.nudgeText && r.nudgeAt && r.nudgeAt >= nudgeSince
            ? r.nudgeText
            : null,
        nudgeAt:
          r.nudgeAt && r.nudgeAt >= nudgeSince ? r.nudgeAt.toISOString() : null,
      }));

    const recentNudges = rows
      .filter((r) => Boolean(r.nudgeText) && Boolean(r.nudgeAt && r.nudgeAt >= nudgeSince))
      .sort((a, b) => (b.nudgeAt?.getTime() ?? 0) - (a.nudgeAt?.getTime() ?? 0))
      .map((r) => ({
        user: publicUser(r.visitor),
        name: displayName(r.visitor),
        text: r.nudgeText as string,
        at: r.nudgeAt!.toISOString(),
        activeNow: r.lastSeenAt >= activeSince,
      }));

    return NextResponse.json(
      {
        ok: true,
        data: {
          partners,
          activeVisitors,
          recentNudges,
          ...(degraded ? { degraded: true } : {}),
        },
      },
      { headers: noStore }
    );
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "presence-failed", message: (e as Error).message },
      { status: 500, headers: noStore }
    );
  }
}
