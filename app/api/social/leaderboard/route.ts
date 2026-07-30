// GET /api/social/leaderboard?scope=friends|kecamatan|city&date=YYYY-MM-DD
//
// Ranks people by Skor Sehat (lib/healthScore) for one day.
//
// PRIVACY — this is the one endpoint that returns rows for people the viewer
// is NOT friends with, so it is deliberately narrow: rank, display name,
// @handle, initials, score and badge NAMES only. It never returns meals,
// photos, session detail, macros or location. `daySummaries` (which does
// return that detail) is only ever called for the viewer plus their friends.
//
// The stat line ("168g protein · 7 workout") is derived from aggregates the
// score already needs; for non-friends we omit it rather than leak intake.

import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUserId } from "@/lib/session";
import { friendIds, displayName } from "@/lib/social";
import { healthScore } from "@/lib/healthScore";
import { todayKey } from "@/lib/targets";
import { BADGE_BY_KEY } from "@/lib/badges";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_ROWS = 50;

type Scope = "friends" | "kecamatan" | "city";

type Totals = { kcal?: number; protein?: number; fat?: number; sugar?: number };
const num = (x: unknown) => {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
};

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export async function GET(req: Request) {
  try {
    const viewerId = await getUserId();
    if (!viewerId) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401, headers: noStore });
    }

    const url = new URL(req.url);
    const raw = url.searchParams.get("date") ?? "";
    const date = DATE_RE.test(raw) ? raw : todayKey();
    const scopeRaw = url.searchParams.get("scope") ?? "friends";
    const scope: Scope =
      scopeRaw === "kecamatan" || scopeRaw === "city" ? scopeRaw : "friends";

    const me = await db.user.findUnique({
      where: { id: viewerId },
      select: { id: true, name: true, username: true, email: true, kecamatan: true, city: true },
    });
    if (!me) {
      return NextResponse.json({ ok: false, error: "not-found" }, { status: 404, headers: noStore });
    }

    // Who is in this board?
    const friends = await friendIds(viewerId);
    let userIds: string[];
    let scopeLabel: string;

    if (scope === "friends") {
      userIds = [viewerId, ...friends];
      scopeLabel = "TEMAN";
    } else if (scope === "kecamatan") {
      scopeLabel = me.kecamatan?.toUpperCase() || "KECAMATAN";
      if (!me.kecamatan) {
        userIds = [viewerId];
      } else {
        const rows = await db.user.findMany({
          where: { kecamatan: me.kecamatan },
          select: { id: true },
          take: 500,
        });
        userIds = rows.map((r) => r.id);
      }
    } else {
      scopeLabel = me.city?.toUpperCase() || "KOTA";
      if (!me.city) {
        userIds = [viewerId];
      } else {
        const rows = await db.user.findMany({
          where: { city: me.city },
          select: { id: true },
          take: 500,
        });
        userIds = rows.map((r) => r.id);
      }
    }
    userIds = Array.from(new Set(userIds));

    const [users, meals, workouts, cardio, targets, badgeRows] = await Promise.all([
      db.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, username: true, email: true },
      }),
      db.mealEntry.findMany({
        where: { userId: { in: userIds }, date },
        select: { userId: true, totals: true },
      }),
      db.workoutSession.findMany({
        where: { userId: { in: userIds }, date },
        select: { userId: true, exercises: { select: { name: true } } },
      }),
      db.cardioSession.findMany({
        where: { userId: { in: userIds }, date },
        select: { userId: true, distanceM: true },
      }),
      db.userTarget.findMany({
        where: { userId: { in: userIds } },
        select: { userId: true, kcal: true, protein: true },
      }),
      db.userBadge.findMany({
        where: { userId: { in: userIds }, earnedAt: { not: null } },
        select: { userId: true, key: true },
      }),
    ]);

    const agg = new Map<
      string,
      { kcal: number; protein: number; fat: number; sugar: number; sessions: number; machines: number; distanceM: number }
    >();
    for (const id of userIds) {
      agg.set(id, { kcal: 0, protein: 0, fat: 0, sugar: 0, sessions: 0, machines: 0, distanceM: 0 });
    }
    for (const m of meals) {
      const a = agg.get(m.userId);
      if (!a) continue;
      const t = (m.totals ?? {}) as Totals;
      a.kcal += num(t.kcal);
      a.protein += num(t.protein);
      a.fat += num(t.fat);
      a.sugar += num(t.sugar);
    }
    for (const w of workouts) {
      const a = agg.get(w.userId);
      if (!a) continue;
      a.sessions += 1;
      a.machines += new Set(w.exercises.map((e) => e.name)).size;
    }
    for (const c of cardio) {
      const a = agg.get(c.userId);
      if (!a) continue;
      a.sessions += 1;
      a.distanceM += c.distanceM ?? 0;
    }

    const targetById = new Map(targets.map((t) => [t.userId, t]));
    const badgesById = new Map<string, string[]>();
    for (const b of badgeRows) {
      const label = BADGE_BY_KEY[b.key]?.label;
      if (!label) continue;
      const list = badgesById.get(b.userId) ?? [];
      list.push(label);
      badgesById.set(b.userId, list);
    }

    const friendSet = new Set(friends);

    const rows = users.map((u) => {
      const a = agg.get(u.id)!;
      const t = targetById.get(u.id);
      const score = healthScore({
        kcal: a.kcal,
        kcalTarget: t?.kcal ?? 2200,
        protein: a.protein,
        proteinTarget: t?.protein ?? 150,
        sugar: a.sugar,
        fat: a.fat,
        sessions: a.sessions,
      });
      const name = displayName(u);
      const isMe = u.id === viewerId;
      const isFriend = friendSet.has(u.id);
      return {
        userId: u.id,
        name,
        username: u.username,
        initials: initialsOf(name),
        score: score.total,
        badges: (badgesById.get(u.id) ?? []).slice(0, 3),
        isMe,
        // Friend state so the row can render TEMAN / + TAMBAH / KAMU inline.
        isFriend,
        // Detail line only for people whose day you're already allowed to see.
        detail:
          isMe || isFriend
            ? `${Math.round(a.protein)}g protein · ${a.sessions} sesi · ${a.machines} mesin`
            : null,
      };
    });

    rows.sort((x, y) => y.score - x.score || x.name.localeCompare(y.name));
    const ranked = rows.map((r, i) => ({ ...r, rank: i + 1 }));
    const myRank = ranked.find((r) => r.isMe)?.rank ?? null;

    return NextResponse.json(
      {
        ok: true,
        data: {
          date,
          scope,
          scopeLabel,
          total: ranked.length,
          myRank,
          rows: ranked.slice(0, MAX_ROWS),
        },
      },
      { headers: noStore }
    );
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "leaderboard-failed", message: (e as Error).message },
      { status: 500, headers: noStore }
    );
  }
}
