import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { todayKey, TARGETS } from "@/lib/targets";

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
    const today = todayKey();

    const [meals, dailyLog] = await Promise.all([
      db.mealEntry.findMany({ where: { date: today } }),
      db.dailyLog.findUnique({ where: { date: today } }),
    ]);

    const target = dailyLog?.gymDay ? TARGETS.gymDay : TARGETS.restDay;

    const { loggedKcal, loggedProtein } = meals.reduce(
      (acc, m) => {
        const t = m.totals as { kcal?: number; protein?: number } | null;
        acc.loggedKcal += t?.kcal ?? 0;
        acc.loggedProtein += t?.protein ?? 0;
        return acc;
      },
      { loggedKcal: 0, loggedProtein: 0 }
    );

    const remainingKcal = Math.max(0, Math.round(target.kcal - loggedKcal));
    const remainingProtein = Math.max(0, Math.round(target.protein - loggedProtein));

    const alert = remainingKcal < 400 || remainingProtein < 30;

    return NextResponse.json(
      {
        metric: remainingKcal.toString(),
        unit: "KCAL",
        label: "left today",
        alert,
        alertMessage: alert ? `${remainingProtein}g protein left` : "",
        urgency: alert ? "warning" : "info",
      },
      { headers: corsHeaders }
    );
  } catch {
    return NextResponse.json(
      {
        metric: "—",
        unit: "",
        label: "unavailable",
        alert: false,
        alertMessage: "",
        urgency: "info",
      },
      { headers: corsHeaders }
    );
  }
}
