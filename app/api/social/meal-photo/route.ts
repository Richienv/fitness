// POST /api/social/meal-photo?mealId=<id>  (body = the raw image)
//
// Attaches a proof photo to one of YOUR OWN meals. Ownership is checked before
// anything is uploaded, so you can't attach a photo to someone else's entry.
//
// Storage is Vercel Blob. When BLOB_READ_WRITE_TOKEN isn't configured the
// route fails closed with a clear message rather than throwing — the photo
// slot in the UI simply stays empty.

import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { db } from "@/lib/db";
import { getUserId } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "no-store" };
// Meal photos are compressed client-side; this is a backstop, and also keeps
// us clear of the serverless request-body limit.
const MAX_BYTES = 4 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(req: Request) {
  try {
    const userId = await getUserId();
    if (!userId) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401, headers: noStore });
    }
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json(
        {
          ok: false,
          error: "storage-not-configured",
          message: "Upload foto belum aktif — set BLOB_READ_WRITE_TOKEN di Vercel.",
        },
        { status: 503, headers: noStore }
      );
    }

    const mealId = new URL(req.url).searchParams.get("mealId") ?? "";
    if (!mealId) {
      return NextResponse.json({ ok: false, error: "bad-request" }, { status: 400, headers: noStore });
    }

    // OWNERSHIP before upload — never spend storage on a request that can't win.
    const meal = await db.mealEntry.findUnique({
      where: { id: mealId },
      select: { userId: true },
    });
    if (!meal) {
      return NextResponse.json({ ok: false, error: "not-found" }, { status: 404, headers: noStore });
    }
    if (meal.userId !== userId) {
      return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403, headers: noStore });
    }

    const type = req.headers.get("content-type")?.split(";")[0] ?? "";
    if (!ALLOWED.has(type)) {
      return NextResponse.json(
        { ok: false, error: "bad-type", message: "Format harus JPEG, PNG, atau WebP." },
        { status: 415, headers: noStore }
      );
    }
    const bytes = await req.arrayBuffer();
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES) {
      return NextResponse.json(
        { ok: false, error: "bad-size", message: "Foto terlalu besar (maks 4 MB)." },
        { status: 413, headers: noStore }
      );
    }

    const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
    const blob = await put(`meals/${userId}/${mealId}.${ext}`, bytes, {
      access: "public",
      contentType: type,
      // Overwrite when a photo is replaced instead of piling up orphans.
      allowOverwrite: true,
    });

    await db.mealEntry.update({ where: { id: mealId }, data: { photoUrl: blob.url } });

    return NextResponse.json({ ok: true, data: { photoUrl: blob.url } }, { headers: noStore });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: "upload-failed", message: (e as Error).message },
      { status: 500, headers: noStore }
    );
  }
}
