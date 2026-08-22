import { cookies } from "next/headers";
import { prisma } from "@/src/lib/prisma";

// The name of the cookie we store the "acting as" user id in. Kept in one
// place so the reader (below) and the writer (src/actions/session.ts)
// can't drift out of sync.
export const ACTIVE_USER_COOKIE = "activeUserId";

/**
 * Reads the "acting as" cookie and loads that User from the database.
 * Any Server Component or Server Action can call this to find out who's
 * currently using the app — there is no real login, so this cookie *is*
 * the entire session mechanism for v1.
 */
export async function getActiveUser() {
  const cookieStore = await cookies();
  const activeUserId = cookieStore.get(ACTIVE_USER_COOKIE)?.value;

  if (!activeUserId) {
    return null;
  }

  return prisma.user.findUnique({ where: { id: activeUserId } });
}
