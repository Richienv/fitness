import { NextResponse } from "next/server";
import { weekSnapshot } from "@/lib/hermes";

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
    const weekStart = url.searchParams.get("startDate") ?? undefined;
    const data = await weekSnapshot(weekStart ?? undefined);
    return NextResponse.json({ ok: true, data }, { headers: corsHeaders });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "week-failed", message: (e as Error).message },
      { status: 500, headers: corsHeaders }
    );
  }
}
