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
  // Follow graph + feed. Session-gated inside each route (getUserId), and the
  // feed only ever returns data for ACCEPTED follows.
  "/api/social",
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

  // The service worker precaches /offline at install time and serves it when a
  // navigation can't reach the network. Redirecting it to /login would cache a
  // login page as the offline screen, so it stays open.
  if (pathname === "/offline") return NextResponse.next();

  // /install is the link people forward to friends. Whoever opens it does not
  // have an account yet, so gating it behind /login makes it a dead end.
  if (pathname === "/install") return NextResponse.next();

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
    // sw.js is listed by name: the extension list below stops at static image
    // types, and a service worker that 302s to /login never installs.
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|sw.js|manifest.webmanifest|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|txt|json)).*)",
  ],
};
