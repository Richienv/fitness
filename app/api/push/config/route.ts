import { NextResponse } from "next/server";
import { getVapidPublicKey, isWebPushConfigured } from "@/lib/webPush";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

export async function GET() {
  const publicKey = getVapidPublicKey();
  const enabled = isWebPushConfigured();
  return NextResponse.json(
    {
      ok: true,
      enabled,
      publicKey: enabled ? publicKey : null,
    },
    { headers: noStore },
  );
}
