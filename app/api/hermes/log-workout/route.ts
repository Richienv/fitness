import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { todayKey } from "@/lib/targets";
import { getActor, logActivity } from "@/lib/audit";
import { normalizeSessionType } from "@/lib/hermes";

type ExerciseInput = {
  name: string;
  sets?: number;
  reps?: number;
  weight?: number;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      type?: string;
      notes?: string;
      date?: string;
      exercises?: ExerciseInput[];
    };

    if (!body.type) {
      return NextResponse.json(
        { ok: false, error: "bad-request", message: "type required" },
        { status: 400 }
      );
    }
    const sessionType = normalizeSessionType(body.type);
    if (!sessionType) {
      return NextResponse.json(
        {
          ok: false,
          error: "bad-request",
          message: `type must be one of Push A/Push B/Pull A/Pull B/Legs/Cardio/Custom`,
        },
        { status: 400 }
      );
    }

    const date = body.date ?? todayKey();
    const exercises = Array.isArray(body.exercises) ? body.exercises : [];
    let totalVolume = 0;
    for (const ex of exercises) {
      if (
        typeof ex.sets === "number" &&
        typeof ex.reps === "number" &&
        typeof ex.weight === "number"
      ) {
        totalVolume += ex.sets * ex.reps * ex.weight;
      }
    }

    const session = await db.workoutSession.create({
      data: {
        date,
        sessionType,
        totalVolume,
        exercises: {
          create: exercises.map((ex) => ({
            name: ex.name,
            sets: [
              {
                sets: ex.sets ?? null,
                reps: ex.reps ?? null,
                weight: ex.weight ?? null,
              },
            ] as never,
          })),
        },
      },
      include: { exercises: true },
    });

    const actor = getActor(req);
    await logActivity({
      actor,
      action: "log-workout",
      entityId: session.id,
      entityType: "WorkoutSession",
      payload: { type: sessionType, notes: body.notes, exercises },
    });

    return NextResponse.json({
      ok: true,
      data: {
        session: {
          id: session.id,
          date: session.date,
          sessionType: session.sessionType,
          totalVolume: session.totalVolume,
          exerciseCount: session.exercises.length,
        },
      },
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: "log-workout-failed",
        message: (e as Error).message,
      },
      { status: 500 }
    );
  }
}
