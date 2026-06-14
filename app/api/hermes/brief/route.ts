import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getActor, logActivity } from "@/lib/audit";
import {
  DAILY_CALORIE_TARGET,
  computeStreak,
  microTotalsFor,
  todaySnapshot,
  weekSnapshot,
} from "@/lib/hermes";
import { DEFAULT_MICRO_TARGETS, MICRO_DEFS, type MicroKey } from "@/lib/nutritionTargets";

type BriefType = "today" | "week" | "preworkout" | "postworkout" | "micros";
const VALID: BriefType[] = ["today", "week", "preworkout", "postworkout", "micros"];

const MICRO_LABEL: Record<MicroKey, string> = {
  fiber: "fiber", sugar: "sugar", na: "sodium", k: "potassium", mg: "magnesium",
  fe: "iron", zn: "zinc", ca: "calcium", omega3: "omega-3",
};

/** Compute how many of the "hit" micros maxed today + which one is the
 *  biggest shortfall (so Ren can give one concrete action). */
function microStatus(
  micros: Awaited<ReturnType<typeof microTotalsFor>>,
  proteinG: number,
  proteinTarget: number
) {
  const targets = DEFAULT_MICRO_TARGETS;
  const rows: { key: MicroKey | "protein"; label: string; value: number; target: number; unit: string; pct: number }[] = [
    { key: "protein", label: "protein", value: proteinG, target: proteinTarget, unit: "g", pct: proteinG / proteinTarget },
  ];
  for (const def of MICRO_DEFS) {
    if (def.kind !== "hit") continue;
    const value = micros[def.key as keyof typeof micros] as number;
    rows.push({
      key: def.key,
      label: MICRO_LABEL[def.key],
      value,
      target: targets[def.key],
      unit: def.unit,
      pct: value / targets[def.key],
    });
  }
  const maxed = rows.filter((r) => r.pct >= 1).length;
  // Biggest shortfall by percent-of-target.
  const shortfalls = rows.filter((r) => r.pct < 1).sort((a, b) => a.pct - b.pct);
  const worst = shortfalls[0] ?? null;
  return { rows, maxed, total: rows.length, worst };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { type?: string };
    const type = body.type as BriefType | undefined;
    if (!type || !VALID.includes(type)) {
      return NextResponse.json(
        { ok: false, error: "bad-request", message: `type must be one of ${VALID.join(",")}` },
        { status: 400 }
      );
    }

    let text = "";
    if (type === "today") {
      const t = await todaySnapshot();
      const micros = await microTotalsFor(t.date);
      const streak = await computeStreak("meal");
      const status = microStatus(micros, t.calories.protein, t.calories.proteinTarget);
      const bw = t.bodyweight.current
        ? `BW ${t.bodyweight.current}${t.bodyweight.trend ? ", trend " + t.bodyweight.trend : ""}.`
        : "BW belum di-log.";
      const sugarLine = t.calories.sugarOver
        ? `Sugar ${t.calories.sugar}g (over ${t.calories.sugarTarget}g cap!).`
        : `Sugar ${t.calories.sugar}/${t.calories.sugarTarget}g.`;
      const microLine =
        status.maxed === status.total
          ? `Micros ${status.maxed}/${status.total} maxed — gas habis di semua nutrient.`
          : `Micros ${status.maxed}/${status.total} maxed${
              status.worst
                ? `, ${status.worst.label} masih ${Math.round((1 - status.worst.pct) * 100)}% di bawah`
                : ""
            }.`;
      text = [
        "Pagi.",
        `Hari ini ${t.workout.todayType}.`,
        `Sejauh ini ${t.calories.consumed} kal · ${t.calories.protein}g protein, sisa ${Math.max(0, t.calories.remaining)} kal.`,
        sugarLine,
        microLine,
        bw,
        `Streak ${streak} hari.`,
      ].join(" ");
    } else if (type === "micros") {
      const t = await todaySnapshot();
      const micros = await microTotalsFor(t.date);
      const status = microStatus(micros, t.calories.protein, t.calories.proteinTarget);
      if (status.maxed === status.total) {
        text = `${status.maxed}/${status.total} micros maxed hari ini · ALL GREEN. Bonus tags: ${
          (micros.tags && micros.tags.length > 0 ? micros.tags.join(", ") : "—")
        }.`;
      } else {
        // Up to 3 worst shortfalls with one concrete number each.
        const top = status.rows
          .filter((r) => r.pct < 1)
          .sort((a, b) => a.pct - b.pct)
          .slice(0, 3)
          .map((r) => {
            const shortBy = Math.max(0, Math.round((r.target - r.value) * 10) / 10);
            return `${r.label} -${shortBy}${r.unit}`;
          });
        text = `${status.maxed}/${status.total} micros maxed. Gap: ${top.join(", ")}. Bonus: ${
          micros.tags?.length ? micros.tags.join(", ") : "—"
        }.`;
      }
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
