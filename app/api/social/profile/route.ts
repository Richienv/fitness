// GET /api/social/profile?username=<handle>&date=YYYY-MM-DD
//
// A friend's full day + week. PRIVACY: gated on `canView`, so this only
// answers for yourself or someone who ACCEPTED your follow request. A
// non-friend gets 403 with just their public identity — enough to render a
// "request to follow" state, never any of their data.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUserId } from "@/lib/session";
import { canView, daySummaries, displayName, publicUser } from "@/lib/social";
import { healthScore, estimateSteps } from "@/lib/healthScore";
import { mergeBadges } from "@/lib/badges";
import { normalizeUsername } from "@/lib/username";
import { todayKey } from "@/lib/targets";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type Totals = { kcal?: number; protein?: number; fat?: number; carbs?: number; sugar?: number };
const num = (x: unknown) => {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
};

/** The 7 date keys ending at `date`, inclusive. Computed on the date STRING so
 *  it stays in the app's Asia/Shanghai day space rather than drifting via UTC. */
function weekKeys(date: string): string[] {
  const [y, m, d] = date.split("-").map(Number);
  const end = Date.UTC(y, (m || 1) - 1, d || 1, 12);
  const out: string[] = [];
  for (let i = 6; i >= 0; i--) {
    out.push(new Date(end - i * 86_400_000).toISOString().slice(0, 10));
  }
  return out;
}

export async function GET(req: Request) {
  try {
    const viewerId = await getUserId();
    if (!viewerId) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401, headers: noStore });
    }

    const url = new URL(req.url);
    const username = normalizeUsername(url.searchParams.get("username") ?? "").replace(/[^a-z0-9_]/g, "");
    const raw = url.searchParams.get("date") ?? "";
    const date = DATE_RE.test(raw) ? raw : todayKey();
    if (!username) {
      return NextResponse.json({ ok: false, error: "bad-request" }, { status: 400, headers: noStore });
    }

    const target = await db.user.findFirst({
      where: { username },
      select: { id: true, name: true, username: true, email: true, heightCm: true },
    });
    if (!target) {
      return NextResponse.json({ ok: false, error: "not-found" }, { status: 404, headers: noStore });
    }

    const allowed = await canView(viewerId, target.id);
    if (!allowed) {
      // Public identity only — never their data.
      return NextResponse.json(
        {
          ok: false,
          error: "forbidden",
          data: { user: publicUser(target), name: displayName(target) },
        },
        { status: 403, headers: noStore }
      );
    }

    const days = weekKeys(date);
    const [summaries, weekMeals, weekWorkouts, weekCardio, targetRow, badgeRows] = await Promise.all([
      daySummaries([target.id], date),
      db.mealEntry.findMany({
        where: { userId: target.id, date: { in: days } },
        select: { date: true, totals: true },
      }),
      db.workoutSession.findMany({
        where: { userId: target.id, date: { in: days } },
        select: { date: true, totalVolume: true, exercises: { select: { name: true, sets: true } } },
      }),
      db.cardioSession.findMany({
        where: { userId: target.id, date: { in: days } },
        select: { date: true, kind: true, distanceM: true, durationSec: true },
      }),
      db.userTarget.findUnique({ where: { userId: target.id }, select: { kcal: true, protein: true } }),
      db.userBadge.findMany({
        where: { userId: target.id },
        select: { key: true, progress: true, earnedAt: true },
      }),
    ]);

    const today = summaries[0] ?? null;

    // Per-day rollup for the weekly chart.
    const byDay = new Map(
      days.map((d) => [d, { date: d, kcal: 0, protein: 0, machines: 0, reps: 0, beban: 0, distanceM: 0, sessions: 0 }])
    );
    for (const m of weekMeals) {
      const row = byDay.get(m.date);
      if (!row) continue;
      const t = (m.totals ?? {}) as Totals;
      row.kcal += num(t.kcal);
      row.protein += num(t.protein);
    }
    for (const w of weekWorkouts) {
      const row = byDay.get(w.date);
      if (!row) continue;
      row.sessions += 1;
      row.machines += new Set(w.exercises.map((e) => e.name)).size;
      row.beban += w.totalVolume;
      for (const ex of w.exercises) {
        const sets = Array.isArray(ex.sets) ? (ex.sets as { reps?: unknown }[]) : [];
        for (const s of sets) row.reps += num(s?.reps);
      }
    }
    for (const c of weekCardio) {
      const row = byDay.get(c.date);
      if (!row) continue;
      row.sessions += 1;
      row.distanceM += c.distanceM ?? 0;
    }

    const week = days.map((d) => {
      const r = byDay.get(d)!;
      return {
        ...r,
        kcal: Math.round(r.kcal),
        protein: Math.round(r.protein),
        beban: Math.round(r.beban),
        steps: estimateSteps(r.distanceM, target.heightCm),
      };
    });

    const kcalTarget = targetRow?.kcal ?? 2200;
    const proteinTarget = targetRow?.protein ?? 150;
    const score = today
      ? healthScore({
          kcal: today.kcal,
          kcalTarget,
          protein: today.protein,
          proteinTarget,
          sugar: today.sugar,
          fat: today.fat,
          sessions: today.workouts.length + today.cardio.length,
        })
      : null;

    const logged = week.filter((d) => d.kcal > 0 || d.sessions > 0).length;

    return NextResponse.json(
      {
        ok: true,
        data: {
          user: publicUser(target),
          name: displayName(target),
          date,
          today,
          score,
          targets: { kcal: kcalTarget, protein: proteinTarget },
          week,
          weekly: {
            avgKcal: Math.round(week.reduce((a, d) => a + d.kcal, 0) / 7),
            totalMachines: week.reduce((a, d) => a + d.machines, 0),
            avgProtein: Math.round(week.reduce((a, d) => a + d.protein, 0) / 7),
            consistency: Math.round((logged / 7) * 100),
          },
          badges: mergeBadges(badgeRows),
        },
      },
      { headers: noStore }
    );
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "profile-failed", message: (e as Error).message },
      { status: 500, headers: noStore }
    );
  }
}
