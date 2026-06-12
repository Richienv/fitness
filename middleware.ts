import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Existing browser-driven endpoints have no key; auth lands on /api/hermes/*.
const PUBLIC_PATHS = [
  "/api/summary",
  "/api/today",
  "/api/week",
  "/api/streak",
  "/api/meals",
  "/api/og",
];

export function middleware(req: NextRequest) {
  if (!req.nextUrl.pathname.startsWith("/api/")) return NextResponse.next();

  const isPublic = PUBLIC_PATHS.some((p) =>
    req.nextUrl.pathname.startsWith(p)
  );
  const isMutation = ["POST", "PATCH", "DELETE", "PUT"].includes(req.method);

  if (isPublic || !isMutation) return NextResponse.next();

  const key = req.headers.get("x-api-key");
  if (!key || key !== process.env.R2_FIT_API_KEY) {
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
