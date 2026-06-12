import { NextResponse } from "next/server";
import { db } from "@/lib/db";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const from = url.searchParams.get("from");
    const sessions = await db.workoutSession.findMany({
      where: from ? { date: { gte: from } } : undefined,
      orderBy: { createdAt: "asc" },
      include: { exercises: true },
    });
    return NextResponse.json(
      {
        ok: true,
        data: {
          sessions: sessions.map((s) => ({
            id: s.id,
            date: s.date,
            sessionType: s.sessionType,
            totalVolume: s.totalVolume,
            createdAt: s.createdAt.getTime(),
            exercises: s.exercises.map((e) => ({ name: e.name, sets: e.sets })),
          })),
        },
      },
      { headers: corsHeaders }
    );
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "workouts-query-failed", message: (e as Error).message },
      { status: 500, headers: corsHeaders }
    );
  }
}

type WorkoutPayload = {
  id: string;
  date: string;
  sessionType: string;
  totalVolume?: number;
  exercises?: Array<{ name: string; sets: unknown }>;
};

function isWorkoutPayload(x: unknown): x is WorkoutPayload {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.date === "string" &&
    typeof o.sessionType === "string"
  );
}

// Browser push: web-completed sessions land in the shared DB so Hermes
// briefings and other devices see them. Upsert keyed by client-side id.
export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!isWorkoutPayload(body)) {
      return NextResponse.json(
        { ok: false, error: "bad-request", message: "id, date, sessionType required" },
        { status: 400, headers: corsHeaders }
      );
    }
    const exercises = Array.isArray(body.exercises) ? body.exercises : [];
    const saved = await db.workoutSession.upsert({
      where: { id: body.id },
      create: {
        id: body.id,
        date: body.date,
        sessionType: body.sessionType,
        totalVolume: body.totalVolume ?? 0,
        exercises: {
          create: exercises.map((e) => ({ name: e.name, sets: e.sets as never })),
        },
      },
      update: {
        date: body.date,
        sessionType: body.sessionType,
        totalVolume: body.totalVolume ?? 0,
        exercises: {
          deleteMany: {},
          create: exercises.map((e) => ({ name: e.name, sets: e.sets as never })),
        },
      },
    });
    return NextResponse.json({ ok: true, data: { id: saved.id } }, { headers: corsHeaders });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "workout-upsert-failed", message: (e as Error).message },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) {
      return NextResponse.json(
        { ok: false, error: "bad-request", message: "id required" },
        { status: 400, headers: corsHeaders }
      );
    }
    await db.workoutSession.delete({ where: { id } }).catch(() => null);
    return NextResponse.json({ ok: true, data: { id } }, { headers: corsHeaders });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "workout-delete-failed", message: (e as Error).message },
      { status: 500, headers: corsHeaders }
    );
  }
}
