import "server-only";
import { cookies } from "next/headers";

// Every seeded demo account (Alex Rivera, Jordan Lee, even Manager) is a
// single shared database row anyone can sign into with one click, the
// whole point of "quick demo sign-in." That also means, without this
// file, whatever one visitor types in gets shown to every other stranger
// who happens to click the same account, nothing ties a record back to
// the specific browser that actually created it.
//
// This cookie identifies the browser, not the account. It's set once in
// middleware.ts, is completely independent of the auth session cookie
// (see src/lib/session.ts), and survives login/logout/role-switching, so
// switching from Customer to Manager in the same tab still shows your own
// work, but a different visitor signing into the same shared account
// never sees it.
export const DEMO_SESSION_COOKIE = "demo_session";

export async function getDemoSessionId(): Promise<string | null> {
  const store = await cookies();
  return store.get(DEMO_SESSION_COOKIE)?.value ?? null;
}

/**
 * A record is visible if it's shared baseline content (demoSessionId is
 * null, the app's seed data and anything generated before this existed)
 * or it belongs to the current browser's own sandbox. AND this into an
 * existing role-based `where` clause, don't use it alone, it's on top of
 * the existing visibility rules, not instead of them.
 */
export function demoSessionFilter(sessionId: string | null) {
  return { OR: [{ demoSessionId: null }, { demoSessionId: sessionId }] };
}
