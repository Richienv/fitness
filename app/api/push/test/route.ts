import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getUserId } from "@/lib/session";
import { displayName } from "@/lib/social";
import { sendPushToUser } from "@/lib/webPush";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

export async function POST() {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401, headers: noStore });
    }

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, username: true, email: true },
    });
    const name = user ? displayName(user) : "Kamu";

    const push = await sendPushToUser(userId, {
      title: "🔔 Tes Notifikasi R2 Fit",
      body: `Notifikasi layar kunci untuk ${name} sudah aktif! 💛`,
      url: "/?couple=1",
      tag: "r2fit-test",
    });

    return NextResponse.json({ ok: true, data: { push } }, { headers: noStore });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "push-test-failed", message: (e as Error).message },
      { status: 500, headers: noStore },
    );
  }
}
