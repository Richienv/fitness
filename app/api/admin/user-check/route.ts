// GET /api/admin/user-check?email=...  — owner-only diagnostic.
//
// Reports whether a given account exists and whether its meals are actually
// landing in the database (counts + dates only, never food content). Used to
// tell apart "the browser isn't keeping the login so writes never reach the
// server" from "writes reach the server but the restore path is broken".
//
// Access: the logged-in HERMES_OWNER_EMAIL account, or an x-api-key matching
// R2_FIT_API_KEY. Nothing else. GET, so it clears the middleware key gate;
// authorization is enforced here.

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

async function authorized(req: Request): Promise<boolean> {
  // 1) x-api-key path
  const key = (req.headers.get("x-api-key") ?? "").trim();
  const expected = (process.env.R2_FIT_API_KEY ?? "").trim();
  if (expected && key && key === expected) return true;

  // 2) logged-in owner path
  const ownerEmail = process.env.HERMES_OWNER_EMAIL?.trim().toLowerCase();
  if (!ownerEmail) return false;
  const session = await auth();
  const uid = session?.user?.id;
  if (!uid) return false;
  const me = await db.user.findUnique({ where: { id: uid }, select: { email: true } });
  return me?.email?.toLowerCase() === ownerEmail;
}

export async function GET(req: Request) {
  try {
    if (!(await authorized(req))) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403, headers: noStore });
    }

    const email = (new URL(req.url).searchParams.get("email") ?? "").trim().toLowerCase();
    if (!email) {
      return NextResponse.json({ ok: false, error: "email required" }, { status: 400, headers: noStore });
    }

    const user = await db.user.findUnique({
      where: { email },
      select: { id: true, createdAt: true, name: true },
    });
    if (!user) {
      return NextResponse.json({ ok: true, data: { exists: false, email } }, { headers: noStore });
    }

    const [mealCount, latest, recent, workoutCount] = await Promise.all([
      db.mealEntry.count({ where: { userId: user.id } }),
      db.mealEntry.findFirst({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true, date: true },
      }),
      db.mealEntry.findMany({
        where: { userId: user.id },
        distinct: ["date"],
        orderBy: { date: "desc" },
        take: 14,
        select: { date: true },
      }),
      db.workoutSession.count({ where: { userId: user.id } }).catch(() => 0),
    ]);

    return NextResponse.json(
      {
        ok: true,
        data: {
          exists: true,
          email,
          name: user.name,
          accountCreatedAt: user.createdAt,
          mealEntryCount: mealCount,
          latestMealCreatedAt: latest?.createdAt ?? null,
          latestMealDate: latest?.date ?? null,
          recentMealDates: recent.map((r) => r.date),
          workoutSessionCount: workoutCount,
        },
      },
      { headers: noStore }
    );
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "user-check-failed", message: (e as Error).message },
      { status: 500, headers: noStore }
    );
  }
}
