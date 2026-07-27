// Server-side helpers for the follow graph.
//
// PRIVACY INVARIANT: nothing about a user's day is readable unless THEY have
// accepted the viewer's follow request. Every read path goes through
// `acceptedFollowingIds` / `canView`, so the check lives in exactly one place
// rather than being re-derived (and eventually mis-derived) per route.

import { db } from "./db";
import { INGREDIENTS } from "./ingredients";

// Library meal items persist as { id, qty } with no name (see
// IngredientMealItem in lib/store.ts) — only custom items carry one. Without
// this lookup every normally-logged food rendered as an em-dash in the feed.
const INGREDIENT_NAME = new Map(INGREDIENTS.map((i) => [i.id, i.name]));

export type PublicUser = { id: string; name: string | null; username: string | null };

/** Strip a user row down to what's safe to expose to another user. The email
 *  is deliberately NOT included — the public identifier is the @username. */
export function publicUser(u: {
  id: string;
  name: string | null;
  username?: string | null;
}): PublicUser {
  return { id: u.id, name: u.name, username: u.username ?? null };
}

/** Display label — name, else the @handle, else the email's local part. */
export function displayName(u: {
  name: string | null;
  username?: string | null;
  email?: string;
}): string {
  return u.name?.trim() || u.username || u.email?.split("@")[0] || "Teman";
}

/** IDs of users who have ACCEPTED `viewerId`'s follow request — i.e. exactly
 *  the people whose data `viewerId` is allowed to see. */
export async function acceptedFollowingIds(viewerId: string): Promise<string[]> {
  const rows = await db.follow.findMany({
    where: { followerId: viewerId, status: "ACCEPTED" },
    select: { followingId: true },
  });
  return rows.map((r) => r.followingId);
}

/** True when `viewerId` may read `targetId`'s day. Always true for yourself. */
export async function canView(viewerId: string, targetId: string): Promise<boolean> {
  if (viewerId === targetId) return true;
  const row = await db.follow.findUnique({
    where: { followerId_followingId: { followerId: viewerId, followingId: targetId } },
    select: { status: true },
  });
  return row?.status === "ACCEPTED";
}

export type DaySummary = {
  user: PublicUser;
  name: string;
  date: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  meals: { mealType: string; kcal: number; items: string[] }[];
  workouts: { sessionType: string; totalVolume: number; exercises: string[] }[];
};

type Totals = { kcal?: number; protein?: number; carbs?: number; fat?: number };
type ItemLike = { name?: string; id?: string; custom?: boolean };

function num(x: unknown): number {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

/** Build one day's summary for each of `userIds`. Callers MUST have already
 *  authorised those ids (see acceptedFollowingIds). */
export async function daySummaries(
  userIds: string[],
  date: string
): Promise<DaySummary[]> {
  if (userIds.length === 0) return [];

  const [users, meals, workouts] = await Promise.all([
    db.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, username: true, email: true },
    }),
    db.mealEntry.findMany({
      where: { userId: { in: userIds }, date },
      select: { userId: true, mealType: true, items: true, totals: true },
      orderBy: { createdAt: "asc" },
    }),
    db.workoutSession.findMany({
      where: { userId: { in: userIds }, date },
      select: {
        userId: true,
        sessionType: true,
        totalVolume: true,
        exercises: { select: { name: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const byUser = new Map<string, DaySummary>();
  for (const u of users) {
    byUser.set(u.id, {
      user: publicUser(u),
      name: displayName(u),
      date,
      kcal: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      meals: [],
      workouts: [],
    });
  }

  for (const m of meals) {
    const s = byUser.get(m.userId);
    if (!s) continue;
    const t = (m.totals ?? {}) as Totals;
    s.kcal += num(t.kcal);
    s.protein += num(t.protein);
    s.carbs += num(t.carbs);
    s.fat += num(t.fat);
    const rawItems = Array.isArray(m.items) ? (m.items as ItemLike[]) : [];
    s.meals.push({
      mealType: m.mealType,
      kcal: Math.round(num(t.kcal)),
      // Custom items carry their name inline; library items only carry an id,
      // resolved here against the shared ingredient list. Unknown ids are
      // dropped rather than shown raw.
      items: rawItems
        .map((i) => {
          if (typeof i?.name === "string" && i.name) return i.name;
          return (typeof i?.id === "string" && INGREDIENT_NAME.get(i.id)) || "";
        })
        .filter((n): n is string => n.length > 0),
    });
  }

  for (const w of workouts) {
    const s = byUser.get(w.userId);
    if (!s) continue;
    s.workouts.push({
      sessionType: w.sessionType,
      totalVolume: Math.round(w.totalVolume),
      exercises: w.exercises.map((e) => e.name),
    });
  }

  return Array.from(byUser.values()).map((s) => ({
    ...s,
    kcal: Math.round(s.kcal),
    protein: Math.round(s.protein),
    carbs: Math.round(s.carbs),
    fat: Math.round(s.fat),
  }));
}
