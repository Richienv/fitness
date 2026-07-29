// POST /api/social/request  { username }  or  { email }  — ask to follow.
//
// Creates a PENDING row. Nothing becomes visible until the target accepts.
// Accepts a public @username (the normal path, discoverable via /search) or an
// exact email (legacy / when you know the address but not the handle). Neither
// form can enumerate users: username needs a full handle, email needs an exact
// match.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUserId } from "@/lib/session";
import { displayName, publicUser } from "@/lib/social";
import { normalizeUsername } from "@/lib/username";

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
      | { username?: unknown; email?: unknown }
      | null;
    const username =
      typeof body?.username === "string" ? normalizeUsername(body.username) : "";
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!username && !email) {
      return NextResponse.json(
        { ok: false, error: "bad-request", message: "Masukkan @username temanmu." },
        { status: 400, headers: noStore }
      );
    }

    const target = await db.user.findFirst({
      where: username ? { username } : { email },
      select: { id: true, name: true, email: true, username: true },
    });
    if (!target) {
      return NextResponse.json(
        {
          ok: false,
          error: "not-found",
          message: username
            ? `Nggak ada akun @${username}.`
            : "Nggak ada akun dengan email itu.",
        },
        { status: 404, headers: noStore }
      );
    }
    if (target.id === userId) {
      return NextResponse.json(
        { ok: false, error: "self", message: "Itu kamu sendiri" },
        { status: 400, headers: noStore }
      );
    }

    const existing = await db.follow.findUnique({
      where: { followerId_followingId: { followerId: userId, followingId: target.id } },
      select: { status: true },
    });
    if (existing?.status === "ACCEPTED") {
      return NextResponse.json(
        { ok: false, error: "already", message: "Kamu sudah mengikuti dia." },
        { status: 409, headers: noStore }
      );
    }

    // A previously declined request may be sent again (upsert back to PENDING).
    const row = await db.follow.upsert({
      where: { followerId_followingId: { followerId: userId, followingId: target.id } },
      create: { followerId: userId, followingId: target.id, status: "PENDING" },
      update: { status: "PENDING", respondedAt: null },
      select: { id: true, status: true },
    });

    return NextResponse.json(
      {
        ok: true,
        data: { followId: row.id, status: row.status, user: publicUser(target), name: displayName(target) },
      },
      { headers: noStore }
    );
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "request-failed", message: (e as Error).message },
      { status: 500, headers: noStore }
    );
  }
}
