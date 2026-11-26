import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUserId } from "@/lib/session";
import { isMissingRelationError } from "@/lib/social";
import { isWebPushConfigured } from "@/lib/webPush";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

function validEndpoint(raw: unknown): raw is string {
  if (typeof raw !== "string" || raw.length < 16 || raw.length > 2048) return false;
  try {
    const u = new URL(raw);
    return u.protocol === "https:";
  } catch {
    return false;
  }
}

export async function GET() {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401, headers: noStore });
    }
    let count = 0;
    let degraded = false;
    try {
      count = await db.pushSubscription.count({ where: { userId } });
    } catch (err) {
      if (isMissingRelationError(err)) degraded = true;
      else throw err;
    }
    return NextResponse.json(
      {
        ok: true,
        data: {
          subscribed: count > 0,
          count,
          configured: isWebPushConfigured(),
          ...(degraded ? { degraded: true } : {}),
        },
      },
      { headers: noStore },
    );
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "push-status-failed", message: (e as Error).message },
      { status: 500, headers: noStore },
    );
  }
}

export async function POST(req: Request) {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401, headers: noStore });
    }

    const body = (await req.json().catch(() => null)) as {
      endpoint?: unknown;
      keys?: { p256dh?: unknown; auth?: unknown };
      userAgent?: unknown;
    } | null;

    const endpoint = body?.endpoint;
    const p256dh = body?.keys?.p256dh;
    const auth = body?.keys?.auth;
    if (
      !validEndpoint(endpoint) ||
      typeof p256dh !== "string" ||
      !p256dh.trim() ||
      typeof auth !== "string" ||
      !auth.trim()
    ) {
      return NextResponse.json(
        { ok: false, error: "bad-request", message: "Valid push subscription keys required." },
        { status: 400, headers: noStore },
      );
    }

    const ua =
      typeof body?.userAgent === "string"
        ? body.userAgent.slice(0, 300)
        : (req.headers.get("user-agent") || "").slice(0, 300) || null;

    try {
      const saved = await db.pushSubscription.upsert({
        where: { endpoint },
        create: {
          userId,
          endpoint,
          p256dh: p256dh.trim(),
          auth: auth.trim(),
          userAgent: ua,
        },
        update: {
          userId,
          p256dh: p256dh.trim(),
          auth: auth.trim(),
          userAgent: ua,
        },
        select: { id: true, endpoint: true },
      });
      return NextResponse.json(
        { ok: true, data: { saved: true, id: saved.id } },
        { headers: noStore },
      );
    } catch (err) {
      if (isMissingRelationError(err)) {
        return NextResponse.json(
          { ok: true, data: { saved: false, degraded: true } },
          { headers: noStore },
        );
      }
      throw err;
    }
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "push-subscribe-failed", message: (e as Error).message },
      { status: 500, headers: noStore },
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401, headers: noStore });
    }
    const url = new URL(req.url);
    const body = (await req.json().catch(() => null)) as { endpoint?: unknown } | null;
    const endpoint =
      typeof body?.endpoint === "string"
        ? body.endpoint.trim()
        : (url.searchParams.get("endpoint") || "").trim();

    try {
      if (endpoint) {
        await db.pushSubscription.deleteMany({ where: { userId, endpoint } });
      } else {
        await db.pushSubscription.deleteMany({ where: { userId } });
      }
      return NextResponse.json({ ok: true, data: { removed: true } }, { headers: noStore });
    } catch (err) {
      if (isMissingRelationError(err)) {
        return NextResponse.json(
          { ok: true, data: { removed: false, degraded: true } },
          { headers: noStore },
        );
      }
      throw err;
    }
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "push-unsubscribe-failed", message: (e as Error).message },
      { status: 500, headers: noStore },
    );
  }
}
