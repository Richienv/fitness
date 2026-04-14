import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { todayKey } from "@/lib/targets";

const DAILY_CALORIE_TARGET = 2200;
const DAILY_PROTEIN_TARGET = 155;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

function payload(remainingKcal: number, remainingProtein: number) {
  const alert = remainingKcal < 400;
  return {
    metric: remainingKcal.toString(),
    unit: "KCAL",
    label: "left today",
    alert,
    alertMessage: alert ? "Low calories" : `${remainingProtein}g protein left`,
    urgency: alert ? "warning" : "info",
  };
}

export async function GET() {
  try {
    const today = todayKey();

    let logs: Array<{ totals: unknown }> = [];
    try {
      logs = await db.mealEntry.findMany({ where: { date: today } });
    } catch {
      logs = [];
    }

    const loggedCalories =
      logs?.reduce((sum, l) => {
        const t = l.totals as { kcal?: number } | null;
        return sum + (t?.kcal ?? 0);
      }, 0) ?? 0;

    const loggedProtein =
      logs?.reduce((sum, l) => {
        const t = l.totals as { protein?: number } | null;
        return sum + (t?.protein ?? 0);
      }, 0) ?? 0;

    const remainingKcal = Math.round(DAILY_CALORIE_TARGET - loggedCalories);
    const remainingProtein = Math.round(DAILY_PROTEIN_TARGET - loggedProtein);

    return NextResponse.json(payload(remainingKcal, remainingProtein), {
      headers: corsHeaders,
    });
  } catch {
    return NextResponse.json(
      payload(DAILY_CALORIE_TARGET, DAILY_PROTEIN_TARGET),
      { headers: corsHeaders }
    );
  }
}
