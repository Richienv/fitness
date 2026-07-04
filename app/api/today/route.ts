import { NextResponse } from "next/server";
import { getUserId } from "@/lib/session";
import { todaySnapshot } from "@/lib/hermes";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function GET() {
  try {
    const userId = await getUserId();
    if (!userId)
      return NextResponse.json(
        { error: "unauthorized" },
        { status: 401, headers: corsHeaders }
      );
    const data = await todaySnapshot(userId);
    return NextResponse.json({ ok: true, data }, { headers: corsHeaders });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: "today-failed",
        message: (e as Error).message,
      },
      { status: 500, headers: corsHeaders }
    );
  }
}
