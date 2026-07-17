import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";

const { auth } = NextAuth(authConfig);

// Web (browser) API endpoints have no api-key; Hermes bot endpoints do. Only
// mutations to non-public paths (i.e. /api/hermes/*) require the key.
const PUBLIC_API_PATHS = [
  "/api/summary",
  "/api/today",
  "/api/week",
  "/api/streak",
  "/api/meals",
  "/api/foods",
  "/api/ingredients",
  "/api/workouts",
  "/api/measurements",
  "/api/targets",
  "/api/widget",
  "/api/og",
  "/api/register",
  "/api/auth",
];

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // ---- API routes: keep the legacy x-api-key gate; never session-redirect ----
  if (pathname.startsWith("/api/")) {
    const isPublic = PUBLIC_API_PATHS.some((p) => pathname.startsWith(p));
    const isMutation = ["POST", "PATCH", "DELETE", "PUT"].includes(req.method);
    if (isPublic || !isMutation) return NextResponse.next();

    const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    const key = (req.headers.get("x-api-key") ?? bearer ?? "").trim();
    const expected = (process.env.R2_FIT_API_KEY ?? "").trim();
    if (!key || !expected || key !== expected) {
      return NextResponse.json(
        { ok: false, error: "unauthorized", message: "Invalid or missing x-api-key" },
        { status: 401 }
      );
    }
    return NextResponse.next();
  }

  // ---- Page routes: gate by session ----
  const isLoggedIn = !!req.auth;
  const isAuthPage = pathname === "/login" || pathname === "/register";
  if (isAuthPage) {
    if (isLoggedIn) return NextResponse.redirect(new URL("/", req.nextUrl));
    return NextResponse.next();
  }
  if (!isLoggedIn) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }
  return NextResponse.next();
});

// Run on pages + /api, but skip Next internals and static asset files.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|txt|json)).*)",
  ],
};
