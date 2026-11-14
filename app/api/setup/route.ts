import { db } from "@/lib/db";
import { getUserId } from "@/lib/session";
import { loginPerson } from "@/lib/privateLogin";
import { buildSetup, sameMeasurement, type AccountSetup } from "@/lib/setup";
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
    const latest = await db.measurement.findFirst({
      where: { userId: id, date: { lte: today() } },
      orderBy: { date: "desc" },
      select: {
        date: true,
        weightKg: true,
        waistCm: true,
        hipCm: true,
        shoulderCm: true,
      },
    });
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
