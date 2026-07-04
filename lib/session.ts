import { auth } from "@/auth";

/** Authenticated user's id, or null when signed out. Use in API routes to
 *  scope every query to the current user. */
export async function getUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}
