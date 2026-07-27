import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getHermesOwnerId } from "@/lib/session";

// Public GET diagnostics: deployment + DB liveness only.
//
// SECURITY: this route is unauthenticated (middleware only enforces the
// api-key on mutations, and a GET is not a mutation), so it must never
// describe R2_FIT_API_KEY beyond "is it set". It previously returned the
// key's exact length and its first/last 4 characters, plus a `keyMatch`
// yes/no for any candidate supplied in x-api-key — together an unlimited
// offline-free guessing oracle against a drastically reduced search space.
// Both the shape fields and the oracle are gone; do not reintroduce them.
export async function GET() {
  const expected = (process.env.R2_FIT_API_KEY ?? "").trim();

  let dbOk = false;
  let dbError: string | null = null;
  let foodCount: number | null = null;
  let foodSampleAyam: number | null = null;
  try {
    await db.$queryRaw`SELECT 1`;
    dbOk = true;
    foodCount = await db.food.count();
    // Diagnostic: does an ILIKE name search return rows? (verifies search path)
    foodSampleAyam = await db.food.count({
      where: { nameNormalized: { contains: "ayam" } },
    });
  } catch (e) {
    dbError = (e as Error).message.slice(0, 200);
  }

  // Resolve owner separately so a DB failure here can't 500 the whole route.
  let ownerConfigured = false;
  try {
    ownerConfigured = !!(await getHermesOwnerId());
  } catch {
    ownerConfigured = false;
  }

  return NextResponse.json(
    {
      ok: true,
      data: {
        // Presence only — never length, never a preview, never a match oracle.
        keyConfigured: expected.length > 0,
        ownerConfigured,
        db: { connected: dbOk, error: dbError },
        foodCount,
        foodSampleAyam,
        deployedAt: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
      },
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
