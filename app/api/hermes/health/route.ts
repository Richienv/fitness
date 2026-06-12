import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// Public GET diagnostics — never returns the key itself, only enough shape
// (length + first/last 4 chars) to spot paste errors in the Vercel env var.
// Send your candidate key in x-api-key to get a definitive match yes/no.
export async function GET(req: Request) {
  const raw = process.env.R2_FIT_API_KEY ?? "";
  const expected = raw.trim();
  const candidate = (req.headers.get("x-api-key") ?? "").trim();

  let dbOk = false;
  let dbError: string | null = null;
  try {
    await db.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch (e) {
    dbError = (e as Error).message.slice(0, 200);
  }

  return NextResponse.json(
    {
      ok: true,
      data: {
        keyConfigured: expected.length > 0,
        keyLength: expected.length,
        keyHadWhitespace: raw !== expected,
        keyPreview: expected
          ? `${expected.slice(0, 4)}…${expected.slice(-4)}`
          : null,
        keyMatch: candidate ? candidate === expected : null,
        db: { connected: dbOk, error: dbError },
        deployedAt: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
      },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
