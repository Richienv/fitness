// GET /api/widget/token — mint a signed, read-only widget token for the
// logged-in user. Session-gated (cookie required). GETs bypass the middleware
// api-key gate, so auth is enforced here via getUserId(). The token is pasted
// into the iOS Scriptable widget, which then calls /api/widget/today with it.

import { NextResponse } from "next/server";
import { getUserId } from "@/lib/session";
import { signWidgetToken } from "@/lib/widgetToken";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

export async function GET() {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json(
        { ok: false, error: "unauthorized" },
        { status: 401, headers: noStore }
      );
    }
    const token = signWidgetToken(userId);
    return NextResponse.json({ ok: true, data: { token } }, { headers: noStore });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "token-failed", message: (e as Error).message },
      { status: 500, headers: noStore }
    );
  }
}
