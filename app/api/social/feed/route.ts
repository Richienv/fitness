// GET /api/social/feed?date=YYYY-MM-DD
//
// One day of every person the caller is ACCEPTED to follow: their calories,
// macros, meals and workouts.
//
// The authorisation is `friendIds(viewerId)` — the id list is
// derived from ACCEPTED follow rows and is the ONLY source of user ids passed
// to the data query. A caller cannot ask for an arbitrary user's day, so a
// PENDING or DECLINED request leaks nothing.

import { NextResponse } from "next/server";
import { getUserId } from "@/lib/session";
import { friendIds, daySummaries } from "@/lib/social";
import { todayKey } from "@/lib/targets";

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request) {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401, headers: noStore });
    }

    const url = new URL(req.url);
    const raw = url.searchParams.get("date") ?? "";
    // Fall back to the app's CST date key, not UTC — date rows are written in
    // Asia/Shanghai, so toISOString() would have queried a different day.
    const date = DATE_RE.test(raw) ? raw : todayKey();

    const ids = await friendIds(userId);
    if (ids.length === 0) {
      return NextResponse.json({ ok: true, data: { date, feed: [] } }, { headers: noStore });
    }

    const feed = await daySummaries(ids, date);
    // Most active first — someone who logged is more interesting than a blank day.
    feed.sort((a, b) => b.kcal - a.kcal || b.workouts.length - a.workouts.length);

    return NextResponse.json({ ok: true, data: { date, feed } }, { headers: noStore });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "feed-failed", message: (e as Error).message },
      { status: 500, headers: noStore }
    );
  }
}
