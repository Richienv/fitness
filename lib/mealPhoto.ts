"use client";

// Attach one photo to a meal: compress on-device, then upload.
//
// Compressing in the browser is what keeps this free — a 4 MB phone capture
// becomes ~150 kB, so Vercel Blob's free tier covers years of meals and the
// upload finishes on mobile data. Nothing is sent anywhere else and no AI
// looks at the picture; it's just proof of what you ate, for you and for the
// friends you've accepted.

import { pushMealNow, setMealPhoto } from "./store";

/** Longest edge of the stored image. Big enough to read a label, small
 *  enough that a meal costs ~150 kB instead of ~4 MB. */
const MAX_EDGE = 1280;
const QUALITY = 0.72;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Gagal membaca foto."));
    };
    img.src = url;
  });
}

/** Downscale to MAX_EDGE and re-encode as JPEG. Falls back to the original
 *  file if the canvas path fails (rare, but a failed encode shouldn't mean a
 *  lost photo — the server cap of 4 MB still applies). */
export async function compressMealPhoto(file: File): Promise<Blob> {
  try {
    const img = await loadImage(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob(res, "image/jpeg", QUALITY)
    );
    return blob ?? file;
  } catch {
    return file;
  }
}

export type PhotoResult =
  | { ok: true; photoUrl: string }
  | { ok: false; message: string };

/** Compress, make sure the meal exists server-side, upload, and mirror the
 *  resulting URL into local storage so the card updates immediately. */
export async function uploadMealPhoto(mealId: string, file: File): Promise<PhotoResult> {
  const blob = await compressMealPhoto(file);

  // The upload addresses the meal by id, and a meal logged seconds ago may
  // still be in flight — persist it first so the upload can't 404.
  const persisted = await pushMealNow(mealId);
  if (!persisted) {
    return { ok: false, message: "Makanan belum tersimpan di server — coba lagi." };
  }

  try {
    const res = await fetch(`/api/social/meal-photo?mealId=${encodeURIComponent(mealId)}`, {
      method: "POST",
      headers: { "Content-Type": blob.type || "image/jpeg" },
      body: blob,
    });
    const data = (await res.json().catch(() => null)) as
      | { ok?: boolean; data?: { photoUrl?: string }; message?: string }
      | null;
    if (!res.ok || !data?.data?.photoUrl) {
      return { ok: false, message: data?.message ?? "Upload foto gagal." };
    }
    setMealPhoto(mealId, data.data.photoUrl);
    return { ok: true, photoUrl: data.data.photoUrl };
  } catch {
    return { ok: false, message: "Upload foto gagal — cek koneksi." };
  }
}
