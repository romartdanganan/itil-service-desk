"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { ACTIVE_USER_COOKIE } from "@/src/lib/session";

// The "use server" directive above marks every export in this file as a
// Server Action: a function that looks like a normal async function to
// the component calling it, but Next.js actually turns it into an HTTP
// endpoint under the hood. When a <form action={setActiveUser}> submits,
// the browser POSTs to that generated endpoint, this function runs on
// the server (with database/cookie access a browser could never have),
// and the page updates — no hand-written API route, no client-side
// fetch() call.
export async function setActiveUser(formData: FormData) {
  const userId = formData.get("userId");

  if (typeof userId !== "string" || userId.length === 0) {
    return;
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_USER_COOKIE, userId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });

  // Tells Next.js "the data behind every page under / may have changed,
  // throw away any cached render and rebuild it." Without this, a page
  // that isn't already forced dynamic could keep showing the previous
  // user's view after the cookie changes.
  revalidatePath("/", "layout");
}
