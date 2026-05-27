import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { todayKey } from "@/lib/targets";
import { getActor, logActivity } from "@/lib/audit";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      kg?: number;
      notes?: string;
      date?: string;
    };

    if (typeof body.kg !== "number" || body.kg <= 0 || body.kg > 500) {
      return NextResponse.json(
        {
          ok: false,
          error: "bad-request",
          message: "kg must be a positive number",
        },
        { status: 400 }
      );
    }

    const date = body.date ?? todayKey();
    const saved = await db.measurement.upsert({
      where: { date },
      create: {
        date,
        weightKg: body.kg,
        notes: body.notes ?? null,
      },
      update: {
        weightKg: body.kg,
        notes: body.notes ?? null,
      },
    });

    const actor = getActor(req);
    await logActivity({
      actor,
      action: "log-weight",
      entityId: saved.id,
      entityType: "Measurement",
      payload: { kg: body.kg, notes: body.notes, date },
    });

    return NextResponse.json({
      ok: true,
      data: {
        measurement: {
          id: saved.id,
          date: saved.date,
          weightKg: saved.weightKg,
        },
      },
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: "log-weight-failed",
        message: (e as Error).message,
      },
      { status: 500 }
    );
  }
}
