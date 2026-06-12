import { NextResponse } from "next/server";
import { db } from "@/lib/db";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
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
    const measurements = await db.measurement.findMany({
      where: from ? { date: { gte: from } } : undefined,
      orderBy: { date: "asc" },
    });
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
    const body = (await req.json()) as {
      date?: string;
      weightKg?: number;
      waistCm?: number;
      shoulderCm?: number;
    };
    if (!body.date || typeof body.date !== "string") {
      return NextResponse.json(
        { ok: false, error: "bad-request", message: "date required" },
        { status: 400, headers: corsHeaders }
      );
    }
    const fields = {
      ...(typeof body.weightKg === "number" ? { weightKg: body.weightKg } : {}),
      ...(typeof body.waistCm === "number" ? { waistCm: body.waistCm } : {}),
      ...(typeof body.shoulderCm === "number" ? { shoulderCm: body.shoulderCm } : {}),
    };
    const saved = await db.measurement.upsert({
      where: { date: body.date },
      create: { date: body.date, ...fields },
      update: fields,
    });
    return NextResponse.json({ ok: true, data: { id: saved.id } }, { headers: corsHeaders });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "measurement-upsert-failed", message: (e as Error).message },
      { status: 500, headers: corsHeaders }
    );
  }
}
