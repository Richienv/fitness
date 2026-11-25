// POST   /api/social/visit   — record/refresh live room visit heartbeat (+ optional sweet nudge), or leaving=true
// DELETE /api/social/visit?hostId=... — end active visit immediately when leaving partner room

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUserId } from "@/lib/session";
import { canView, isMissingRelationError } from "@/lib/social";
import { normalizeUsername } from "@/lib/username";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

async function resolveHostId(hostIdRaw?: unknown, hostUsernameRaw?: unknown): Promise<string | null> {
  const hostId = typeof hostIdRaw === "string" ? hostIdRaw.trim() : "";
  if (hostId) return hostId;
  const username =
    typeof hostUsernameRaw === "string"
      ? normalizeUsername(hostUsernameRaw).replace(/[^a-z0-9_]/g, "")
      : "";
  if (!username) return null;
  const u = await db.user.findFirst({ where: { username }, select: { id: true } });
  return u?.id ?? null;
}

export async function POST(req: Request) {
  try {
    const viewerId = await getUserId();
    if (!viewerId) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401, headers: noStore });
    }

    const body = (await req.json().catch(() => ({}))) as {
      hostId?: unknown;
      hostUsername?: unknown;
      leaving?: unknown;
      nudge?: unknown;
    };

    const hostId = await resolveHostId(body.hostId, body.hostUsername);
    if (!hostId || hostId === viewerId) {
      return NextResponse.json({ ok: false, error: "bad-request" }, { status: 400, headers: noStore });
    }

    const allowed = await canView(viewerId, hostId);
    if (!allowed) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403, headers: noStore });
    }

    const leaving = body.leaving === true;
    const rawNudge = typeof body.nudge === "string" ? body.nudge.trim().slice(0, 120) : "";

    try {
      if (leaving) {
        await db.roomVisit.updateMany({
          where: { visitorId: viewerId, hostId },
          data: { lastSeenAt: new Date(0) },
        });
        return NextResponse.json(
          { ok: true, data: { active: false, hostId } },
          { headers: noStore }
        );
      }

      const now = new Date();
      const row = await db.roomVisit.upsert({
        where: { visitorId_hostId: { visitorId: viewerId, hostId } },
        update: {
          lastSeenAt: now,
          ...(rawNudge ? { nudgeText: rawNudge, nudgeAt: now } : {}),
        },
        create: {
          visitorId: viewerId,
          hostId,
          lastSeenAt: now,
          ...(rawNudge ? { nudgeText: rawNudge, nudgeAt: now } : {}),
        },
        select: { lastSeenAt: true, nudgeText: true, nudgeAt: true },
      });

      return NextResponse.json(
        {
          ok: true,
          data: {
            active: true,
            hostId,
            lastSeenAt: row.lastSeenAt.toISOString(),
            nudgeText: row.nudgeText,
            nudgeAt: row.nudgeAt?.toISOString() ?? null,
          },
        },
        { headers: noStore }
      );
    } catch (err) {
      if (isMissingRelationError(err)) {
        return NextResponse.json(
          { ok: true, data: { active: !leaving, hostId, degraded: true } },
          { headers: noStore }
        );
      }
      throw err;
    }
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "visit-failed", message: (e as Error).message },
      { status: 500, headers: noStore }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const viewerId = await getUserId();
    if (!viewerId) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401, headers: noStore });
    }

    const url = new URL(req.url);
    const hostId = await resolveHostId(
      url.searchParams.get("hostId"),
      url.searchParams.get("username")
    );
    if (!hostId || hostId === viewerId) {
      return NextResponse.json({ ok: false, error: "bad-request" }, { status: 400, headers: noStore });
    }

    try {
      await db.roomVisit.updateMany({
        where: { visitorId: viewerId, hostId },
        data: { lastSeenAt: new Date(0) },
      });
    } catch (err) {
      if (!isMissingRelationError(err)) throw err;
    }

    return NextResponse.json({ ok: true, data: { active: false, hostId } }, { headers: noStore });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "leave-failed", message: (e as Error).message },
      { status: 500, headers: noStore }
    );
  }
}
