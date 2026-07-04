import { auth } from "@/auth";
import { db } from "@/lib/db";

/** Authenticated user's id, or null when signed out. Use in API routes to
 *  scope every query to the current user. */
export async function getUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

/** The account the Telegram/Hermes bot logs into, resolved from
 *  HERMES_OWNER_EMAIL. Hermes authenticates by API key (not a session), so
 *  its writes are attributed to this fixed owner. Returns null if unset or
 *  no such user exists. */
export async function getHermesOwnerId(): Promise<string | null> {
  const email = process.env.HERMES_OWNER_EMAIL?.trim().toLowerCase();
  if (!email) return null;
  const u = await db.user.findUnique({ where: { email } });
  return u?.id ?? null;
}
