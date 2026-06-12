import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getActor, logActivity } from "@/lib/audit";
import {
  DAILY_CALORIE_TARGET,
  computeStreak,
  todaySnapshot,
  weekSnapshot,
} from "@/lib/hermes";

type BriefType = "today" | "week" | "preworkout" | "postworkout";
const VALID: BriefType[] = ["today", "week", "preworkout", "postworkout"];

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { type?: string };
    const type = body.type as BriefType | undefined;
    if (!type || !VALID.includes(type)) {
      return NextResponse.json(
        {
          ok: false,
          error: "bad-request",
          message: `type must be one of ${VALID.join(",")}`,
        },
        { status: 400 }
      );
    }

    let text = "";
    if (type === "today") {
      const t = await todaySnapshot();
      const streak = await computeStreak("meal");
      const bw = t.bodyweight.current
        ? `BW ${t.bodyweight.current}${t.bodyweight.trend ? ", trend " + t.bodyweight.trend : ""}.`
        : "BW belum di-log.";
      const sugarLine = t.calories.sugarOver
        ? `Sugar ${t.calories.sugar}g (over ${t.calories.sugarTarget}g cap!).`
        : `Sugar ${t.calories.sugar}/${t.calories.sugarTarget}g.`;
      text = [
        "Pagi.",
        `Hari ini ${t.workout.todayType}.`,
        `Sejauh ini ${t.calories.consumed} kal · ${t.calories.protein}g protein, sisa ${Math.max(0, t.calories.remaining)} kal.`,
        sugarLine,
        bw,
        `Streak ${streak} hari.`,
      ].join(" ");
    } else if (type === "week") {
      const w = await weekSnapshot();
      const onTrack = w.avgCalories <= DAILY_CALORIE_TARGET + 100;
      text = [
        `Minggu ini ${w.workoutsCompleted} workout done`,
        `· avg ${w.avgCalories} kal · ${w.avgProtein}g protein`,
        w.weightDelta != null ? `· BW ${w.weightDelta > 0 ? "+" : ""}${w.weightDelta}kg` : "",
        `· ${onTrack ? "on track" : "over target"}.`,
      ]
        .filter(Boolean)
        .join(" ");
    } else if (type === "preworkout") {
      const t = await todaySnapshot();
      const last = await db.workoutSession
        .findFirst({
          where: { sessionType: t.workout.todayTypeKey },
          orderBy: { createdAt: "desc" },
          include: { exercises: true },
        })
        .catch(() => null);
      if (!last) {
        text = `${t.workout.todayType} hari ini. Belum ada history — set baseline today.`;
      } else {
        const daysAgo = daysBetween(last.date, t.date);
        text = `${t.workout.todayType} hari ini. Last ${t.workout.todayType} ${daysAgo} hari lalu — total volume ${Math.round(last.totalVolume)}. Push 2.5kg lebih hari ini.`;
      }
    } else if (type === "postworkout") {
      const t = await todaySnapshot();
      const leftKcal = t.calories.remaining;
      const leftProtein = t.calories.proteinRemaining;
      text = [
        `Workout logged.`,
        `${Math.max(0, leftKcal)} kal left untuk hit target.`,
        leftProtein > 0
          ? `Recommend dinner ${Math.min(leftProtein, 80)}g protein.`
          : "Protein target sudah hit — istirahat.",
      ].join(" ");
    }

    const actor = getActor(req);
    await logActivity({
      actor,
      action: "brief",
      entityType: "Brief",
      payload: { type, text },
    });

    return NextResponse.json({ ok: true, data: { type, text } });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "brief-failed", message: (e as Error).message },
      { status: 500 }
    );
  }
}

function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const aMs = Date.UTC(ay, am - 1, ad);
  const bMs = Date.UTC(by, bm - 1, bd);
  return Math.max(0, Math.round((bMs - aMs) / 86400000));
}
