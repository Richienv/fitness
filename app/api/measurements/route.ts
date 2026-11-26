import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUserId } from "@/lib/session";
import { isMissingRelationError } from "@/lib/social";

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
    const userId = await getUserId();
    if (!userId)
      return NextResponse.json(
        { error: "unauthorized" },
        { status: 401, headers: corsHeaders }
      );
    const url = new URL(req.url);
    const from = url.searchParams.get("from");
    const where = from ? { userId, date: { gte: from } } : { userId };

    let rows: Array<{
      id: string;
      userId: string;
      date: string;
      weightKg: number | null;
      waistCm: number | null;
      hipCm: number | null;
      shoulderCm: number | null;
      notes: string | null;
      weighedAt?: Date | null;
      createdAt: Date;
      updatedAt: Date;
    }>;

    try {
      rows = await db.measurement.findMany({
        where,
        orderBy: { date: "asc" },
        select: {
          id: true,
          userId: true,
          date: true,
          weightKg: true,
          waistCm: true,
          hipCm: true,
          shoulderCm: true,
          notes: true,
          weighedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    } catch (err) {
      if (!isMissingRelationError(err)) throw err;
      rows = await db.measurement.findMany({
        where,
        orderBy: { date: "asc" },
        select: {
          id: true,
          userId: true,
          date: true,
          weightKg: true,
          waistCm: true,
          hipCm: true,
          shoulderCm: true,
          notes: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    }

    const measurements = rows.map((row) => ({
      id: row.id,
      userId: row.userId,
      date: row.date,
      weightKg: row.weightKg,
      waistCm: row.waistCm,
      hipCm: row.hipCm,
      shoulderCm: row.shoulderCm,
      notes: row.notes,
      weighedAt: row.weighedAt
        ? row.weighedAt.toISOString()
        : row.weightKg != null
          ? row.updatedAt?.toISOString() ?? null
          : null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));

    return NextResponse.json(
      { ok: true, data: { measurements } },
      { headers: corsHeaders }
    );
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "measurements-query-failed", message: (e as Error).message },
      { status: 500, headers: corsHeaders }
    );
  }
}

// Browser push: web-logged measurements land in the shared DB. Upsert by date.
export async function POST(req: Request) {
  try {
    const userId = await getUserId();
    if (!userId)
      return NextResponse.json(
        { error: "unauthorized" },
        { status: 401, headers: corsHeaders }
      );
    const body = (await req.json()) as {
      date?: string;
      weightKg?: number;
      waistCm?: number;
      hipCm?: number;
      shoulderCm?: number;
      weighedAt?: string;
    };
    if (!body.date || typeof body.date !== "string") {
      return NextResponse.json(
        { ok: false, error: "bad-request", message: "date required" },
        { status: 400, headers: corsHeaders }
      );
    }

    let resolvedWeighedAt: Date | undefined;
    if (typeof body.weightKg === "number" && Number.isFinite(body.weightKg)) {
      const parsed =
        typeof body.weighedAt === "string" ? new Date(body.weighedAt) : null;
      resolvedWeighedAt =
        parsed && Number.isFinite(parsed.getTime()) ? parsed : new Date();
    }

    const baseFields = {
      ...(typeof body.weightKg === "number" ? { weightKg: body.weightKg } : {}),
      ...(typeof body.waistCm === "number" ? { waistCm: body.waistCm } : {}),
      ...(typeof body.hipCm === "number" ? { hipCm: body.hipCm } : {}),
      ...(typeof body.shoulderCm === "number" ? { shoulderCm: body.shoulderCm } : {}),
    };

    const fieldsWithTime = {
      ...baseFields,
      ...(resolvedWeighedAt ? { weighedAt: resolvedWeighedAt } : {}),
    };

    let savedId: string;
    let returnedWeighedAt: string | null = resolvedWeighedAt
      ? resolvedWeighedAt.toISOString()
      : null;

    try {
      const saved = await db.measurement.upsert({
        where: { userId_date: { userId, date: body.date } },
        create: { userId, date: body.date, ...fieldsWithTime },
        update: fieldsWithTime,
        select: { id: true, weighedAt: true },
      });
      savedId = saved.id;
      if (saved.weighedAt) returnedWeighedAt = saved.weighedAt.toISOString();
    } catch (err) {
      if (!isMissingRelationError(err)) throw err;
      const saved = await db.measurement.upsert({
        where: { userId_date: { userId, date: body.date } },
        create: { userId, date: body.date, ...baseFields },
        update: baseFields,
        select: { id: true, updatedAt: true },
      });
      savedId = saved.id;
      if (!returnedWeighedAt && typeof body.weightKg === "number") {
        returnedWeighedAt = saved.updatedAt.toISOString();
      }
    }

    return NextResponse.json(
      { ok: true, data: { id: savedId, weighedAt: returnedWeighedAt } },
      { headers: corsHeaders }
    );
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "measurement-upsert-failed", message: (e as Error).message },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const userId = await getUserId();
    if (!userId)
      return NextResponse.json(
        { error: "unauthorized" },
        { status: 401, headers: corsHeaders }
      );
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    const date = url.searchParams.get("date");
    if (!id && !date) {
      return NextResponse.json(
        { ok: false, error: "bad-request", message: "id or date required" },
        { status: 400, headers: corsHeaders }
      );
    }
    if (id) await db.measurement.deleteMany({ where: { id, userId } }).catch(() => null);
    else if (date)
      await db.measurement.deleteMany({ where: { userId, date } }).catch(() => null);
    return NextResponse.json(
      { ok: true, data: { id: id ?? date } },
      { headers: corsHeaders }
    );
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "measurement-delete-failed", message: (e as Error).message },
      { status: 500, headers: corsHeaders }
    );
  }
}
