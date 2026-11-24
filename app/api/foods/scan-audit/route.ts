// Lightweight scan telemetry for tracking barcode match rate, OCR coverage,
// LLM fallback usage and manual corrections — never stores photos or PII.
import { NextResponse } from "next/server";
import { getUserId } from "@/lib/session";
import { logActivity } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_SOURCES = new Set([
  "barcode_cache",
  "openfoodfacts",
  "ocr_rules",
  "ocr_llm",
  "manual",
]);

export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!body || typeof body.source !== "string" || !ALLOWED_SOURCES.has(body.source)) {
    return NextResponse.json({ error: "invalid audit event" }, { status: 400 });
  }
  const barcode =
    typeof body.barcode === "string" && /^\d{8,14}$/.test(body.barcode)
      ? body.barcode
      : null;
  await logActivity({
    actor: userId,
    action: "nutrition-scan",
    entityId: barcode ?? undefined,
    entityType: "NutritionScan",
    payload: {
      source: body.source,
      ocrConfidence:
        typeof body.ocrConfidence === "number"
          ? Math.round(body.ocrConfidence)
          : null,
      coreFields:
        typeof body.coreFields === "number" ? Math.round(body.coreFields) : null,
      usedLlm: Boolean(body.usedLlm),
      editedByUser: Boolean(body.editedByUser),
      elapsedMs:
        typeof body.elapsedMs === "number" ? Math.round(body.elapsedMs) : null,
      method: typeof body.method === "string" ? body.method.slice(0, 30) : null,
    },
  }).catch(() => {});
  return NextResponse.json({ ok: true });
}
