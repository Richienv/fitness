// GET /api/widget/health-token — mint a send-only token for the Apple Health
// Shortcut, for the signed-in user (session cookie required).
import { NextResponse } from "next/server";
import { getUserId } from "@/lib/session";
import { signHealthToken } from "@/lib/widgetToken";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

export async function GET() {
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401, headers: noStore });
  try {
    return NextResponse.json(
      { ok: true, data: { token: signHealthToken(userId) } },
      { headers: noStore },
    );
  } catch {
    return NextResponse.json({ ok: false, error: "token-failed" }, { status: 500, headers: noStore });
  }
}
