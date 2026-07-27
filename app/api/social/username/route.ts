// GET  /api/social/username            → my current handle
// POST /api/social/username { username } → claim / change it
//
// One handle per account (the column is @unique), stored lowercase so the
// unique index is effectively case-insensitive.

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getUserId } from "@/lib/session";
import { normalizeUsername, usernameError } from "@/lib/username";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

export async function GET() {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401, headers: noStore });
    }
    const me = await db.user.findUnique({
      where: { id: userId },
      select: { username: true, name: true, email: true },
    });
    return NextResponse.json({ ok: true, data: me }, { headers: noStore });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "username-failed", message: (e as Error).message },
      { status: 500, headers: noStore }
    );
  }
}

export async function POST(req: Request) {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401, headers: noStore });
    }

    const body = (await req.json().catch(() => null)) as { username?: unknown } | null;
    const raw = typeof body?.username === "string" ? body.username : "";
    const err = usernameError(raw);
    if (err) {
      return NextResponse.json(
        { ok: false, error: "invalid", message: err },
        { status: 400, headers: noStore }
      );
    }
    const username = normalizeUsername(raw);

    try {
      await db.user.update({ where: { id: userId }, data: { username } });
    } catch (e) {
      // P2002 = unique violation → someone already holds this handle.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        return NextResponse.json(
          { ok: false, error: "taken", message: `@${username} sudah dipakai orang lain.` },
          { status: 409, headers: noStore }
        );
      }
      throw e;
    }

    return NextResponse.json({ ok: true, data: { username } }, { headers: noStore });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "username-failed", message: (e as Error).message },
      { status: 500, headers: noStore }
    );
  }
}
