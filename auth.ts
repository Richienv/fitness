import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

// Email + password auth. Credentials provider requires JWT sessions (there's
// no DB session row to look up), so we carry the user id on the token.
//
// NOTE: this module imports bcrypt + Prisma, so it is NOT edge-safe. When we
// add route-gating middleware (Phase 4) it must use a separate edge-safe
// `auth.config.ts` (no bcrypt/prisma) — not this file.
export const { handlers, auth, signIn, signOut } = NextAuth({
  // Trust the Vercel host header when building callback URLs (all 3 project
  // domains). Prevents host-mismatch from silently failing the session.
  trustHost: true,
  // Persist the login for 90 days (default is 30) and refresh the cookie's
  // expiry at most once a day, so returning users aren't asked to log in again.
  // NOTE: this does NOT help if the browser refuses to store cookies at all
  // (in-app browsers / Private Browsing / "Block All Cookies") — that's the
  // usual cause of "logged out every open".
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 24 * 90,
    updateAge: 60 * 60 * 24,
  },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (creds) => {
        const email = String(creds?.email ?? "").trim().toLowerCase();
        const password = String(creds?.password ?? "");
        if (!email || !password) return null;
        const user = await db.user.findUnique({ where: { email } });
        if (!user) return null;
        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;
        return { id: user.id, email: user.email, name: user.name ?? undefined };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.uid = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.uid && session.user) {
        session.user.id = token.uid as string;
      }
      return session;
    },
  },
});
