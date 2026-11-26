import { db } from "@/lib/db";
import { getUserId } from "@/lib/session";
import { loginPerson } from "@/lib/privateLogin";
import { buildSetup, sameMeasurement, type AccountSetup } from "@/lib/setup";
import type { CompanionGoal } from "@/lib/companionProgress";
import { isMissingRelationError } from "@/lib/social";
import type { Prisma } from "@prisma/client";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
const answer = (body: unknown, status = 200) =>
  Response.json(body, { status, headers });
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export async function GET() {
  const id = await getUserId();
  if (!id) return answer({ error: "unauthorized" }, 401);
  try {
    const user = await db.user.findUnique({
      where: { id },
      select: { loginAlias: true, setup: true },
    });
    const person = loginPerson(user?.loginAlias);
    if (!person) return answer({ error: "Akun belum terhubung." }, 403);
    let latestRaw: {
      date: string;
      weightKg: number | null;
      waistCm: number | null;
      hipCm: number | null;
      shoulderCm: number | null;
      weighedAt?: Date | null;
      updatedAt: Date;
    } | null = null;
    try {
      latestRaw = await db.measurement.findFirst({
        where: { userId: id, date: { lte: today() } },
        orderBy: { date: "desc" },
        select: {
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
      latestRaw = await db.measurement.findFirst({
        where: { userId: id, date: { lte: today() } },
        orderBy: { date: "desc" },
        select: {
          date: true,
          weightKg: true,
          waistCm: true,
          hipCm: true,
          shoulderCm: true,
          updatedAt: true,
        },
      });
    }
    const latest = latestRaw
      ? {
          date: latestRaw.date,
          weightKg: latestRaw.weightKg,
          waistCm: latestRaw.waistCm,
          hipCm: latestRaw.hipCm,
          shoulderCm: latestRaw.shoulderCm,
          weighedAt: latestRaw.weighedAt
            ? latestRaw.weighedAt.toISOString()
            : latestRaw.weightKg != null
              ? latestRaw.updatedAt.toISOString()
              : undefined,
        }
      : null;
    return answer({ person, setup: user?.setup ?? null, latest });
  } catch {
    return answer({ error: "Data akun belum bisa dimuat. Coba lagi." }, 503);
  }
}
export async function POST(req: Request) {
  const id = await getUserId();
  if (!id) return answer({ error: "unauthorized" }, 401);
  if (
    req.headers.get("origin") &&
    req.headers.get("origin") !== new URL(req.url).origin
  )
    return answer({ error: "forbidden" }, 403);
  const body = await req.json().catch(() => null);
  if (!body) return answer({ error: "Data tidak valid." }, 400);
  try {
    const user = await db.user.findUnique({
      where: { id },
      select: { loginAlias: true, setup: true },
    });
    const person = loginPerson(user?.loginAlias);
    if (!person) return answer({ error: "Akun belum terhubung." }, 403);
    let setup: AccountSetup;
    try {
      setup = buildSetup(
        body,
        person,
        today(),
        user?.setup as AccountSetup | null,
      );
    } catch (e) {
      return answer({ error: (e as Error).message }, 400);
    }
    await db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: {
          setup: setup as unknown as Prisma.InputJsonValue,
          sex: setup.profile.sex,
          goal: setup.profile.goal,
          heightCm: setup.profile.heightCm,
        },
        select: { id: true },
      });
      // A profile edit does not rewrite an unchanged historical scale record.
      const old = user?.setup as AccountSetup | null;
      if (!sameMeasurement(old?.measurement, setup.measurement)) {
        const { date, ...fields } = setup.measurement;
        await tx.measurement.upsert({
          where: { userId_date: { userId: id, date } },
          create: { userId: id, date, ...fields },
          update: fields,
        });
      }
      const target = setup.trainingDays.includes(
        new Date(today() + "T12:00:00+08:00").getUTCDay(),
      )
        ? setup.targets.gymDay
        : setup.targets.restDay;
      await tx.userTarget.upsert({
        where: { userId: id },
        create: { userId: id, kcal: target.kcal, protein: target.protein },
        update: { kcal: target.kcal, protein: target.protein },
      });
    });
    return answer({ setup });
  } catch {
    return answer(
      { error: "Belum tersimpan. Koneksi bermasalah; data di form tetap ada." },
      503,
    );
  }
}

function posNum(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null;
}

function sanitizeGoal(raw: unknown): CompanionGoal | null {
  if (!raw || typeof raw !== "object") return null;
  const g = raw as Record<string, unknown>;
  if (g.mode !== "weight" && g.mode !== "recomp") return null;
  const baselineDate =
    typeof g.baselineDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(g.baselineDate)
      ? g.baselineDate
      : today();
  const reps =
    typeof g.reps === "number" && Number.isFinite(g.reps) && g.reps >= 1
      ? Math.round(g.reps)
      : 8;
  return {
    mode: g.mode,
    baselineDate,
    baselineWeight: posNum(g.baselineWeight),
    targetWeight: posNum(g.targetWeight),
    baselineWaist: posNum(g.baselineWaist),
    targetWaist: posNum(g.targetWaist),
    exercise: typeof g.exercise === "string" ? g.exercise.slice(0, 120) : "",
    reps,
    baselineLift: posNum(g.baselineLift),
    targetLift: posNum(g.targetLift),
  };
}

export async function PATCH(req: Request) {
  const id = await getUserId();
  if (!id) return answer({ error: "unauthorized" }, 401);
  if (
    req.headers.get("origin") &&
    req.headers.get("origin") !== new URL(req.url).origin
  )
    return answer({ error: "forbidden" }, 403);
  const body = (await req.json().catch(() => null)) as {
    companionGoal?: unknown;
  } | null;
  const goal = sanitizeGoal(body?.companionGoal);
  if (!goal) return answer({ error: "Target tidak valid." }, 400);

  try {
    const user = await db.user.findUnique({
      where: { id },
      select: { loginAlias: true, setup: true },
    });
    const person = loginPerson(user?.loginAlias);
    if (!person) return answer({ error: "Akun belum terhubung." }, 403);
    const existing = user?.setup as AccountSetup | null;
    if (!existing) return answer({ ok: true, setup: null });

    const nowIso = new Date().toISOString();
    const nextWeightTarget =
      goal.mode === "weight" && goal.targetWeight
        ? goal.targetWeight
        : existing.targetWeightKg;

    const updatedSetup: AccountSetup = {
      ...existing,
      updatedAt: nowIso,
      companionGoalUpdatedAt: nowIso,
      targetWeightKg: nextWeightTarget,
      draft: {
        ...existing.draft,
        target: String(nextWeightTarget),
      },
      companionGoal: goal,
    };

    await db.user.update({
      where: { id },
      data: {
        setup: updatedSetup as unknown as Prisma.InputJsonValue,
      },
      select: { id: true },
    });

    return answer({ ok: true, setup: updatedSetup });
  } catch {
    return answer(
      { error: "Belum tersimpan. Koneksi bermasalah; coba lagi." },
      503,
    );
  }
}
