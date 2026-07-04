import { NextResponse } from "next/server";
import { getUserId } from "@/lib/session";
import { computeStreak, type StreakType } from "@/lib/hermes";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

const VALID: StreakType[] = ["meal", "workout", "weight"];

export async function GET(req: Request) {
  try {
    const userId = await getUserId();
    if (!userId)
      return NextResponse.json(
        { error: "unauthorized" },
        { status: 401, headers: corsHeaders }
      );
    const url = new URL(req.url);
    const type = (url.searchParams.get("type") ?? "meal") as StreakType;
    if (!VALID.includes(type)) {
      return NextResponse.json(
        {
          ok: false,
          error: "invalid-type",
          message: `type must be one of ${VALID.join(",")}`,
        },
        { status: 400, headers: corsHeaders }
      );
    }
    const streak = await computeStreak(userId, type);
    return NextResponse.json(
      { ok: true, data: { type, streak } },
      { headers: corsHeaders }
    );
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "streak-failed", message: (e as Error).message },
      { status: 500, headers: corsHeaders }
    );
  }
}
