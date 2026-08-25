import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { DEMO_SESSION_COOKIE } from "@/src/lib/demo-session";

// Assigns every browser a private demo-sandbox id on its first request,
// see src/lib/demo-session.ts for what this actually gates. Deliberately
// not the auth session cookie: this one is never cleared by logging out,
// it identifies the visitor, not whichever shared demo account happens
// to be signed in at the moment.
//
// Named `proxy.ts`, not `middleware.ts`: Next.js renamed the convention
// (same request-interception mechanism, same file location, just a
// different export name) in the version this project is on.
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export function proxy(request: NextRequest) {
  if (request.cookies.has(DEMO_SESSION_COOKIE)) {
    return NextResponse.next();
  }

  const response = NextResponse.next();
  response.cookies.set(DEMO_SESSION_COOKIE, crypto.randomUUID(), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
  });
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
