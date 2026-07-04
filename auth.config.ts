import type { NextAuthConfig } from "next-auth";

// Edge-safe Auth.js config — NO bcrypt / Prisma imports, so it can be used by
// `middleware.ts` (edge runtime). The Credentials provider (which needs
// bcrypt + Prisma) is added on top of this in `auth.ts` for the Node runtime.
export const authConfig = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [],
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
    // Gates page routes (see middleware matcher). Signed-out users hitting a
    // protected page are redirected to /login; signed-in users on the auth
    // pages are bounced home.
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const p = nextUrl.pathname;
      const isAuthPage = p === "/login" || p === "/register";
      if (isAuthPage) {
        if (isLoggedIn) return Response.redirect(new URL("/", nextUrl));
        return true;
      }
      return isLoggedIn;
    },
  },
} satisfies NextAuthConfig;
