import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUserId } from "@/lib/session";
import { canView, displayName, isMissingRelationError } from "@/lib/social";
import {
  cleanCheerMessage,
  formatCheerNotification,
  normalizeCheerKind,
} from "@/lib/cheerFormat";
import { sendPushToUser } from "@/lib/webPush";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

export async function GET(req: Request) {
  try {
    const viewerId = await getUserId();
    if (!viewerId) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401, headers: noStore });
    }
    const url = new URL(req.url);
    const partnerId = (url.searchParams.get("partnerId") || "").trim();
    if (!partnerId || partnerId === viewerId) {
      return NextResponse.json({ ok: false, error: "bad-request" }, { status: 400, headers: noStore });
    }
    if (!(await canView(viewerId, partnerId))) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403, headers: noStore });
    }

    try {
      const rows = await db.partnerCheer.findMany({
        where: {
          OR: [
            { senderId: viewerId, targetId: partnerId },
            { senderId: partnerId, targetId: viewerId },
          ],
        },
        include: {
          sender: { select: { id: true, name: true, username: true, email: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 30,
      });

      const cheers = rows.reverse().map((r) => {
        const senderName = displayName(r.sender);
        return {
          id: r.id,
          senderId: r.senderId,
          targetId: r.targetId,
          senderName,
          kind: normalizeCheerKind(r.kind),
          message: r.message,
          readAt: r.readAt ? r.readAt.toISOString() : null,
          createdAt: r.createdAt.toISOString(),
          isMine: r.senderId === viewerId,
          formatted: formatCheerNotification({
            senderName,
            kind: r.kind,
            message: r.message,
          }),
        };
      });

      return NextResponse.json({ ok: true, data: { cheers } }, { headers: noStore });
    } catch (err) {
      if (isMissingRelationError(err)) {
        return NextResponse.json(
          { ok: true, data: { cheers: [], degraded: true } },
          { headers: noStore },
        );
      }
      throw err;
    }
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "cheer-list-failed", message: (e as Error).message },
      { status: 500, headers: noStore },
    );
  }
}

export async function POST(req: Request) {
  try {
    const viewerId = await getUserId();
    if (!viewerId) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401, headers: noStore });
    }
    const body = (await req.json().catch(() => null)) as {
      partnerId?: unknown;
      kind?: unknown;
      message?: unknown;
    } | null;

    const partnerId = typeof body?.partnerId === "string" ? body.partnerId.trim() : "";
    const message = cleanCheerMessage(body?.message);
    const kind = normalizeCheerKind(body?.kind);
    if (!partnerId || partnerId === viewerId || !message) {
      return NextResponse.json(
        { ok: false, error: "bad-request", message: "Partner and message required." },
        { status: 400, headers: noStore },
      );
    }

    if (!(await canView(viewerId, partnerId))) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403, headers: noStore });
    }

    const sender = await db.user.findUnique({
      where: { id: viewerId },
      select: { id: true, name: true, username: true, email: true },
    });
    const senderName = sender ? displayName(sender) : "Pasangan";
    const appOrigin =
      (process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || "").replace(/\/+$/, "") ||
      new URL(req.url).origin;
    const formatted = formatCheerNotification({
      senderName,
      kind,
      message,
      appUrl: `${appOrigin}/?couple=1`,
    });

    const now = new Date();
    let degraded = false;
    let cheer = {
      id: `local-${now.getTime()}`,
      senderId: viewerId,
      targetId: partnerId,
      senderName,
      kind,
      message,
      readAt: null as string | null,
      createdAt: now.toISOString(),
      isMine: true,
      formatted,
    };

    try {
      const created = await db.partnerCheer.create({
        data: {
          senderId: viewerId,
          targetId: partnerId,
          kind,
          message,
        },
        select: { id: true, createdAt: true },
      });
      cheer = {
        ...cheer,
        id: created.id,
        createdAt: created.createdAt.toISOString(),
      };
    } catch (err) {
      if (isMissingRelationError(err)) {
        degraded = true;
      } else {
        throw err;
      }
    }

    // Also update RoomVisit nudge so the Home doorway glow + legacy nudge banner fire immediately.
    try {
      await db.roomVisit.upsert({
        where: { visitorId_hostId: { visitorId: viewerId, hostId: partnerId } },
        update: {
          nudgeText: formatted.banner.slice(0, 120),
          nudgeAt: now,
        },
        create: {
          visitorId: viewerId,
          hostId: partnerId,
          lastSeenAt: new Date(0),
          nudgeText: formatted.banner.slice(0, 120),
          nudgeAt: now,
        },
      });
    } catch (err) {
      if (!isMissingRelationError(err)) throw err;
    }

    const push = await sendPushToUser(partnerId, {
      title: formatted.title,
      body: formatted.body,
      url: formatted.url,
      tag: formatted.tag,
      data: {
        kind: formatted.kind,
        senderId: viewerId,
        cheerId: cheer.id,
      },
    });

    return NextResponse.json(
      {
        ok: true,
        data: {
          cheer,
          push,
          formatted,
          ...(degraded ? { degraded: true } : {}),
        },
      },
      { headers: noStore },
    );
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "cheer-send-failed", message: (e as Error).message },
      { status: 500, headers: noStore },
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const viewerId = await getUserId();
    if (!viewerId) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401, headers: noStore });
    }
    const body = (await req.json().catch(() => null)) as { partnerId?: unknown } | null;
    const partnerId = typeof body?.partnerId === "string" ? body.partnerId.trim() : "";

    let updated = 0;
    try {
      const res = await db.partnerCheer.updateMany({
        where: {
          targetId: viewerId,
          readAt: null,
          ...(partnerId ? { senderId: partnerId } : {}),
        },
        data: { readAt: new Date() },
      });
      updated = res.count;
    } catch (err) {
      if (!isMissingRelationError(err)) throw err;
    }

    return NextResponse.json({ ok: true, data: { updated } }, { headers: noStore });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "cheer-read-failed", message: (e as Error).message },
      { status: 500, headers: noStore },
    );
  }
}
