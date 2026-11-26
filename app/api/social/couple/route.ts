import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUserId } from "@/lib/session";
import {
  canView,
  daySummaries,
  displayName,
  friendIds,
  isMissingRelationError,
  publicUser,
  type DaySummary,
} from "@/lib/social";
import { todayKey } from "@/lib/targets";
import {
  companionProgress,
  dateOffset,
  type Character,
} from "@/lib/companionProgress";
import {
  avatarImageSrc,
  clampAvatarLevel,
  getAvatarLevelMeta,
  TIER_META,
} from "@/lib/avatarLevels";
import {
  resolvePersonCharacter,
  resolvePersonCompanionGoal,
  resolvePersonNutritionTargets,
  resolvePersonTargetWeightKg,
} from "@/lib/personTargets";
import { formatCheerNotification, normalizeCheerKind } from "@/lib/cheerFormat";
import { isWebPushConfigured } from "@/lib/webPush";

type MeasInput = Parameters<typeof companionProgress>[1][number];
type WorkoutInput = Parameters<typeof companionProgress>[2][number];

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ACTIVE_WINDOW_MS = 45_000;
const NUDGE_WINDOW_MS = 6 * 3600_000;

type UserFullRow = {
  id: string;
  name: string | null;
  username: string | null;
  email: string;
  loginAlias: string | null;
  sex: string | null;
  setup: unknown;
  heightCm: number | null;
};

type MeasRow = {
  userId: string;
  date: string;
  weightKg: number | null;
  waistCm: number | null;
  hipCm: number | null;
  shoulderCm: number | null;
  weighedAt?: Date | null;
  updatedAt: Date;
};

function pickPartner(
  friends: UserFullRow[],
  requestedId: string | null,
): UserFullRow | null {
  if (requestedId) {
    return friends.find((f) => f.id === requestedId) ?? null;
  }
  const romantic = friends.find((f) =>
    /\b(renita|richie)\b/i.test(
      `${f.loginAlias ?? ""} ${f.name ?? ""} ${f.username ?? ""}`,
    ),
  );
  return romantic ?? friends[0] ?? null;
}

function buildSide({
  user,
  date,
  measRows,
  workoutRows,
  targetRow,
  summary,
  pushSubCount,
}: {
  user: UserFullRow;
  date: string;
  measRows: MeasRow[];
  workoutRows: WorkoutInput[];
  targetRow: { kcal: number; protein: number } | null;
  summary: DaySummary | undefined;
  pushSubCount: number;
}) {
  const character: Character = resolvePersonCharacter(user);
  const measList: MeasInput[] = measRows.map((m) => ({
    date: m.date,
    ...(m.weightKg != null ? { weightKg: m.weightKg } : {}),
    ...(m.waistCm != null ? { waistCm: m.waistCm } : {}),
    ...(m.hipCm != null ? { hipCm: m.hipCm } : {}),
    ...(m.shoulderCm != null ? { shoulderCm: m.shoulderCm } : {}),
    weighedAt: m.weighedAt
      ? m.weighedAt.toISOString()
      : m.weightKg != null
        ? m.updatedAt.toISOString()
        : undefined,
  }));

  const goal = resolvePersonCompanionGoal(user, measList);
  const prog = companionProgress(goal, measList, workoutRows, date);
  const level = clampAvatarLevel(prog.level ?? 1);
  const highestLevel = clampAvatarLevel(prog.highestLevel ?? level);
  const meta = getAvatarLevelMeta(character, level);
  const tier = TIER_META[meta.tier];

  const validWeights = measRows
    .filter((m) => typeof m.weightKg === "number" && m.weightKg > 0 && m.date <= date)
    .sort((a, b) => a.date.localeCompare(b.date));
  const latestMeas = validWeights.at(-1) ?? null;
  const setupWeight =
    user.setup && typeof user.setup === "object"
      ? (user.setup as { profile?: { weightKg?: number | null } }).profile?.weightKg ?? null
      : null;

  const currentKg =
    latestMeas?.weightKg ??
    (typeof setupWeight === "number" && setupWeight > 0 ? setupWeight : null);
  const targetKg = resolvePersonTargetWeightKg(user);
  const baselineKg =
    goal.mode === "weight" && goal.baselineWeight
      ? goal.baselineWeight
      : validWeights[0]?.weightKg ?? currentKg;

  const weighedAt = latestMeas?.weighedAt
    ? latestMeas.weighedAt.toISOString()
    : latestMeas?.weightKg != null
      ? latestMeas.updatedAt.toISOString()
      : null;

  const targets = resolvePersonNutritionTargets(user, targetRow, date);

  return {
    user: publicUser(user),
    displayName: displayName(user),
    character,
    avatar: {
      level,
      highestLevel,
      demoted: prog.demoted,
      demotedFrom: prog.demotedFrom,
      fraction: prog.fraction ?? 0,
      title: meta.title,
      tierLabel: tier.label,
      tierAccent: tier.accent,
      imageSrc: avatarImageSrc(character, level),
      currentKg,
      targetKg,
      baselineKg,
      weighedAt,
      weighedDate: latestMeas?.date ?? null,
    },
    targets,
    today: {
      kcal: summary?.kcal ?? 0,
      protein: summary?.protein ?? 0,
      carbs: summary?.carbs ?? 0,
      fat: summary?.fat ?? 0,
      sugar: summary?.sugar ?? 0,
      meals: summary?.meals ?? [],
      workouts: summary?.workouts ?? [],
      cardio: summary?.cardio ?? [],
      lastActivityAt: summary?.lastActivityAt ?? null,
      lastActivityLabel: summary?.lastActivityLabel ?? null,
    },
    pushEnabled: pushSubCount > 0,
  };
}

export async function GET(req: Request) {
  try {
    const viewerId = await getUserId();
    if (!viewerId) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401, headers: noStore });
    }

    const url = new URL(req.url);
    const requestedPartnerId = (url.searchParams.get("partnerId") || "").trim() || null;
    const rawDate = url.searchParams.get("date") ?? "";
    const date = DATE_RE.test(rawDate) ? rawDate : todayKey();

    if (requestedPartnerId) {
      if (requestedPartnerId === viewerId || !(await canView(viewerId, requestedPartnerId))) {
        return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403, headers: noStore });
      }
    }

    const friends = await friendIds(viewerId);
    const userIdsToFetchFriends = friends.length > 0 ? friends : [];

    const [meUser, friendUsers] = await Promise.all([
      db.user.findUnique({
        where: { id: viewerId },
        select: {
          id: true,
          name: true,
          username: true,
          email: true,
          loginAlias: true,
          sex: true,
          setup: true,
          heightCm: true,
        },
      }),
      userIdsToFetchFriends.length > 0
        ? db.user.findMany({
            where: { id: { in: userIdsToFetchFriends } },
            select: {
              id: true,
              name: true,
              username: true,
              email: true,
              loginAlias: true,
              sex: true,
              setup: true,
              heightCm: true,
            },
            orderBy: { createdAt: "asc" },
          })
        : Promise.resolve([] as UserFullRow[]),
    ]);

    if (!meUser) {
      return NextResponse.json({ ok: false, error: "not-found" }, { status: 404, headers: noStore });
    }

    const partnerUser = pickPartner(friendUsers, requestedPartnerId);
    const pairIds = partnerUser ? [meUser.id, partnerUser.id] : [meUser.id];
    const start28d = dateOffset(date, -27);

    const fetchMeasurements = async (): Promise<MeasRow[]> => {
      try {
        return await db.measurement.findMany({
          where: { userId: { in: pairIds }, date: { lte: date } },
          orderBy: { date: "asc" },
          select: {
            userId: true,
            date: true,
            weightKg: true,
            waistCm: true,
            hipCm: true,
            shoulderCm: true,
            weighedAt: true,
            updatedAt: true,
          },
        });
      } catch (err) {
        if (!isMissingRelationError(err)) throw err;
        return await db.measurement.findMany({
          where: { userId: { in: pairIds }, date: { lte: date } },
          orderBy: { date: "asc" },
          select: {
            userId: true,
            date: true,
            weightKg: true,
            waistCm: true,
            hipCm: true,
            shoulderCm: true,
            updatedAt: true,
          },
        });
      }
    };

    const now = Date.now();
    const activeSince = new Date(now - ACTIVE_WINDOW_MS);
    const nudgeSince = new Date(now - NUDGE_WINDOW_MS);

    const [
      allMeas,
      allTargets,
      allWorkoutsRaw,
      summaries,
      pushCounts,
      visitRows,
      cheerRows,
    ] = await Promise.all([
      fetchMeasurements(),
      db.userTarget.findMany({
        where: { userId: { in: pairIds } },
        select: { userId: true, kcal: true, protein: true },
      }),
      db.workoutSession.findMany({
        where: { userId: { in: pairIds }, date: { gte: start28d, lte: date } },
        orderBy: { date: "asc" },
        select: {
          id: true,
          userId: true,
          date: true,
          sessionType: true,
          exercises: { select: { name: true, sets: true } },
        },
      }),
      daySummaries(pairIds, date),
      Promise.all(
        pairIds.map(async (uid) => {
          try {
            const count = await db.pushSubscription.count({ where: { userId: uid } });
            return [uid, count] as const;
          } catch (err) {
            if (isMissingRelationError(err)) return [uid, 0] as const;
            throw err;
          }
        }),
      ),
      friends.length > 0
        ? db.roomVisit
            .findMany({
              where: {
                hostId: viewerId,
                visitorId: { in: friends },
                OR: [
                  { lastSeenAt: { gte: activeSince } },
                  { nudgeAt: { gte: nudgeSince } },
                ],
              },
              include: {
                visitor: {
                  select: { id: true, name: true, username: true, email: true },
                },
              },
              orderBy: { lastSeenAt: "desc" },
            })
            .catch((err) => {
              if (isMissingRelationError(err)) return [];
              throw err;
            })
        : Promise.resolve([]),
      partnerUser
        ? db.partnerCheer
            .findMany({
              where: {
                OR: [
                  { senderId: viewerId, targetId: partnerUser.id },
                  { senderId: partnerUser.id, targetId: viewerId },
                ],
              },
              include: {
                sender: {
                  select: { id: true, name: true, username: true, email: true },
                },
              },
              orderBy: { createdAt: "desc" },
              take: 30,
            })
            .catch((err) => {
              if (isMissingRelationError(err)) return [];
              throw err;
            })
        : Promise.resolve([]),
    ]);

    const measByUser = new Map<string, MeasRow[]>();
    for (const m of allMeas) {
      const arr = measByUser.get(m.userId) ?? [];
      arr.push(m);
      measByUser.set(m.userId, arr);
    }

    const workoutsByUser = new Map<string, WorkoutInput[]>();
    for (const w of allWorkoutsRaw) {
      const arr = workoutsByUser.get(w.userId) ?? [];
      arr.push({
        id: w.id,
        date: w.date,
        sessionType: w.sessionType as WorkoutInput["sessionType"],
        startedAt: 0,
        completed: true,
        exercises: w.exercises.map((e) => ({
          exerciseName: e.name,
          sets: Array.isArray(e.sets)
            ? (e.sets as WorkoutInput["exercises"][number]["sets"])
            : [],
        })),
      });
      workoutsByUser.set(w.userId, arr);
    }

    const targetByUser = new Map(allTargets.map((t) => [t.userId, t]));
    const summaryByUser = new Map(summaries.map((s) => [s.user.id, s]));
    const pushMap = new Map(pushCounts);

    const me = buildSide({
      user: meUser,
      date,
      measRows: measByUser.get(meUser.id) ?? [],
      workoutRows: workoutsByUser.get(meUser.id) ?? [],
      targetRow: targetByUser.get(meUser.id) ?? null,
      summary: summaryByUser.get(meUser.id),
      pushSubCount: pushMap.get(meUser.id) ?? 0,
    });

    const partner = partnerUser
      ? buildSide({
          user: partnerUser,
          date,
          measRows: measByUser.get(partnerUser.id) ?? [],
          workoutRows: workoutsByUser.get(partnerUser.id) ?? [],
          targetRow: targetByUser.get(partnerUser.id) ?? null,
          summary: summaryByUser.get(partnerUser.id),
          pushSubCount: pushMap.get(partnerUser.id) ?? 0,
        })
      : null;

    const partners = friendUsers.map((u) => ({
      ...publicUser(u),
      displayName: displayName(u),
    }));

    const activeVisitors = visitRows
      .filter((r) => r.lastSeenAt >= activeSince)
      .map((r) => ({
        user: publicUser(r.visitor),
        name: displayName(r.visitor),
        lastSeenAt: r.lastSeenAt.toISOString(),
        nudgeText:
          r.nudgeText && r.nudgeAt && r.nudgeAt >= nudgeSince
            ? r.nudgeText
            : null,
        nudgeAt:
          r.nudgeAt && r.nudgeAt >= nudgeSince ? r.nudgeAt.toISOString() : null,
      }));

    const recentNudges = visitRows
      .filter((r) => Boolean(r.nudgeText) && Boolean(r.nudgeAt && r.nudgeAt >= nudgeSince))
      .sort((a, b) => (b.nudgeAt?.getTime() ?? 0) - (a.nudgeAt?.getTime() ?? 0))
      .map((r) => ({
        user: publicUser(r.visitor),
        name: displayName(r.visitor),
        text: r.nudgeText as string,
        at: r.nudgeAt!.toISOString(),
        activeNow: r.lastSeenAt >= activeSince,
      }));

    const cheers = [...cheerRows].reverse().map((r) => {
      const senderName = displayName(r.sender);
      return {
        id: r.id,
        senderId: r.senderId,
        targetId: r.targetId,
        senderName,
        kind: normalizeCheerKind(r.kind),
        message: r.message,
        readAt: r.readAt ? r.readAt.toISOString() : null,
        createdAt: r.createdAt.toISOString(),
        isMine: r.senderId === viewerId,
        formatted: formatCheerNotification({
          senderName,
          kind: r.kind,
          message: r.message,
        }),
      };
    });

    return NextResponse.json(
      {
        ok: true,
        data: {
          date,
          me,
          partner,
          partners,
          presence: {
            activeVisitors,
            recentNudges,
            partnerVisitingMe: partnerUser
              ? activeVisitors.some((v) => v.user.id === partnerUser.id)
              : false,
          },
          cheers,
          pushConfigured: isWebPushConfigured(),
        },
      },
      { headers: noStore },
    );
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "couple-failed", message: (e as Error).message },
      { status: 500, headers: noStore },
    );
  }
}
