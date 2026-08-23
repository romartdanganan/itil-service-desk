import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { prisma } from "@/src/lib/prisma";

// The v1 role-switcher stored a plain, unsigned cookie holding a user id
// directly — anyone could edit that cookie in devtools and become any
// user. This is what real authentication replaces: the cookie now holds
// a signed JWT, so the server can trust the user id inside it wasn't
// tampered with (a forged/edited token fails `jwtVerify` and is treated
// as logged out).
export const SESSION_COOKIE = "session";
const SESSION_DURATION_SECONDS = 7 * 24 * 60 * 60; // 7 days

function getSecretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    // Fails loudly rather than silently signing with an empty/undefined
    // key — a session "secret" that isn't actually secret is worse than
    // no sessions at all.
    throw new Error(
      "SESSION_SECRET is not set. Generate one with `openssl rand -base64 32` and add it to .env (see .env.example).",
    );
  }
  return new TextEncoder().encode(secret);
}

type SessionPayload = { userId: string };

async function createSessionToken(userId: string): Promise<string> {
  return new SignJWT({ userId } satisfies SessionPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(getSecretKey());
}

async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey(), { algorithms: ["HS256"] });
    if (typeof payload.userId !== "string") {
      return null;
    }
    return { userId: payload.userId };
  } catch {
    // Expired, forged, or signed with a since-rotated secret — all of
    // these should just look like "not logged in", not crash the page.
    return null;
  }
}

/** Sign a session for this user and set it as an HttpOnly cookie. */
export async function createSession(userId: string): Promise<void> {
  const token = await createSessionToken(userId);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
  });
}

export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

/**
 * Reads and verifies the session cookie, then loads that User from the
 * database. Any Server Component or Server Action can call this to find
 * out who's currently logged in — this is the one function every
 * role-gated page and action in the app calls, so this is the only place
 * that needed to change when the role-switcher was replaced with real
 * login: everything downstream still just gets a `User | null` back.
 */
export async function getActiveUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) {
    return null;
  }

  const payload = await verifySessionToken(token);
  if (!payload) {
    return null;
  }

  return prisma.user.findUnique({ where: { id: payload.userId } });
}
