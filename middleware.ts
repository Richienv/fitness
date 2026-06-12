import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Existing browser-driven endpoints have no key; auth lands on /api/hermes/*.
const PUBLIC_PATHS = [
  "/api/summary",
  "/api/today",
  "/api/week",
  "/api/streak",
  "/api/meals",
  "/api/foods",
  "/api/ingredients",
  "/api/workouts",
  "/api/measurements",
  "/api/og",
];

export function middleware(req: NextRequest) {
  if (!req.nextUrl.pathname.startsWith("/api/")) return NextResponse.next();

  const isPublic = PUBLIC_PATHS.some((p) =>
    req.nextUrl.pathname.startsWith(p)
  );
  const isMutation = ["POST", "PATCH", "DELETE", "PUT"].includes(req.method);

  if (isPublic || !isMutation) return NextResponse.next();

  // Accept x-api-key or Authorization: Bearer. Trim both sides — pasted env
  // vars often carry an invisible trailing newline and exact compare 401s.
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const key = (req.headers.get("x-api-key") ?? bearer ?? "").trim();
  const expected = (process.env.R2_FIT_API_KEY ?? "").trim();
  if (!key || !expected || key !== expected) {
    return NextResponse.json(
      {
        ok: false,
        error: "unauthorized",
        message: "Invalid or missing x-api-key",
      },
      { status: 401 }
    );
  }
  return NextResponse.next();
}

export const config = { matcher: "/api/:path*" };
