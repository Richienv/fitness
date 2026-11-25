// GET / POST /api/habit-graph
//
// Optional additive persistence for the per-user Habit Graph memory snapshot.
// Degrades gracefully with HTTP 200 `{ degraded: true }` if HabitGraphState
// hasn't been pushed to Postgres yet (never crashes the app).

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUserId } from "@/lib/session";
import { normalizeHabitGraph } from "@/lib/habitGraph";
import { isMissingRelationError } from "@/lib/social";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

export async function GET() {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401, headers: noStore });
    }

    try {
      const row = await db.habitGraphState.findUnique({
        where: { userId },
        select: { version: true, graph: true, updatedAt: true },
      });
      if (!row) {
        return NextResponse.json({ ok: true, data: { graph: null } }, { headers: noStore });
      }
      return NextResponse.json(
        {
          ok: true,
          data: {
            graph: normalizeHabitGraph(row.graph, userId),
            updatedAt: row.updatedAt.toISOString(),
          },
        },
        { headers: noStore },
      );
    } catch (err) {
      if (isMissingRelationError(err)) {
        return NextResponse.json(
          { ok: true, data: { graph: null, degraded: true } },
          { headers: noStore },
        );
      }
      throw err;
    }
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "habit-graph-read-failed", message: (e as Error).message },
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

    const body = (await req.json().catch(() => null)) as { graph?: unknown } | null;
    if (!body || !body.graph || typeof body.graph !== "object") {
      return NextResponse.json({ ok: false, error: "invalid-payload" }, { status: 400, headers: noStore });
    }

    const normalized = normalizeHabitGraph(body.graph, userId);

    try {
      const saved = await db.habitGraphState.upsert({
        where: { userId },
        create: {
          userId,
          version: normalized.version,
          graph: normalized as never,
        },
        update: {
          version: normalized.version,
          graph: normalized as never,
        },
        select: { updatedAt: true },
      });
      return NextResponse.json(
        { ok: true, data: { saved: true, updatedAt: saved.updatedAt.toISOString() } },
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
      { ok: false, error: "habit-graph-save-failed", message: (e as Error).message },
      { status: 500, headers: noStore },
    );
  }
}
