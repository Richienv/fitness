import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { todayKey } from "@/lib/targets";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "https://r2-os.vercel.app",
  "Access-Control-Allow-Methods": "GET",
  "Cache-Control": "no-store",
};

export async function GET() {
  try {
    const today = todayKey();

    const [meals, dailyLog, workout] = await Promise.all([
      db.mealEntry.findMany({ where: { date: today } }),
      db.dailyLog.findUnique({ where: { date: today } }),
      db.workoutSession.findFirst({ where: { date: today } }),
    ]);

    const totalKcal = meals.reduce((sum, m) => {
      const totals = m.totals as { kcal?: number } | null;
      return sum + (totals?.kcal ?? 0);
    }, 0);

    const gymDay = dailyLog?.gymDay ?? false;
    const target = gymDay ? 2200 : 1700;
    const remaining = Math.max(0, target - totalKcal);

    const alert = remaining > 500 || !workout;

    return NextResponse.json(
      {
        metric: remaining.toString(),
        label: "kcal left",
        detail: `${totalKcal} of ${target} kcal logged`,
        alert,
        alertText: !workout
          ? "No gym session logged today"
          : `${remaining} kcal remaining`,
        urgency: remaining > 800 ? "warning" : "info",
        app: "R2·FIT",
        url: "https://r2-fit.vercel.app",
      },
      { headers: CORS_HEADERS }
    );
  } catch {
    return NextResponse.json(
      {
        metric: "—",
        label: "kcal left",
        detail: "Unable to load",
        alert: false,
        urgency: "info",
        app: "R2·FIT",
        url: "https://r2-fit.vercel.app",
      },
      { headers: CORS_HEADERS }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    headers: {
      "Access-Control-Allow-Origin": "https://r2-os.vercel.app",
      "Access-Control-Allow-Methods": "GET",
    },
  });
}
