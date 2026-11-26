import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUserId } from "@/lib/session";
import { isMissingRelationError } from "@/lib/social";
import { notifyPartnerActivity } from "@/lib/partnerNotify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AchievementSyncItem = {
  key: string;
  title: string;
  stageName?: string;
  progress: number;
  unlocked: boolean;
};

export async function POST(req: Request) {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
    const body = (await req.json().catch(() => null)) as {
      achievements?: AchievementSyncItem[];
    } | null;
    const list = Array.isArray(body?.achievements) ? body.achievements : [];
    if (list.length === 0) {
      return NextResponse.json({ ok: true, newlyUnlocked: [] });
    }

    const newlyUnlocked: AchievementSyncItem[] = [];

    try {
      const existingRows = await db.userBadge.findMany({
        where: { userId },
        select: { key: true, earnedAt: true },
      });
      const existingMap = new Map(existingRows.map((r) => [r.key, r.earnedAt]));

      for (const item of list.slice(0, 24)) {
        if (!item || typeof item.key !== "string" || !item.key.trim()) continue;
        const cleanKey = item.key.trim().slice(0, 64);
        const progress =
          typeof item.progress === "number" && Number.isFinite(item.progress)
            ? Math.max(0, item.progress)
            : 0;
        const prevEarned = existingMap.get(cleanKey) ?? null;
        const shouldEarn = Boolean(item.unlocked) && !prevEarned;
        const earnedAt = prevEarned ?? (item.unlocked ? new Date() : null);

        await db.userBadge.upsert({
          where: { userId_key: { userId, key: cleanKey } },
          create: {
            userId,
            key: cleanKey,
            progress,
            earnedAt,
          },
          update: {
            progress,
            ...(shouldEarn ? { earnedAt } : {}),
          },
        });

        if (shouldEarn) {
          newlyUnlocked.push(item);
        }
      }
    } catch (err) {
      if (!isMissingRelationError(err)) throw err;
    }

    if (newlyUnlocked.length > 0) {
      const first = newlyUnlocked[0];
      void notifyPartnerActivity(userId, {
        type: "achievement",
        title: first.title || first.key,
        stageName: first.stageName,
      });
    }

    return NextResponse.json({
      ok: true,
      newlyUnlocked: newlyUnlocked.map((x) => x.key),
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "achievements-sync-failed", message: (e as Error).message },
      { status: 500 },
    );
  }
}
