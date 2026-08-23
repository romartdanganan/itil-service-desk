"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/src/lib/prisma";
import { hashPassword, verifyPassword } from "@/src/lib/password";
import { createSession, deleteSession } from "@/src/lib/session";
import { Role } from "@/app/generated/prisma/client";

export type AuthFormState = { error: string } | undefined;

const INVALID_CREDENTIALS_MESSAGE = "Invalid email or password.";

async function authenticate(email: unknown, password: unknown): Promise<AuthFormState> {
  if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
    return { error: INVALID_CREDENTIALS_MESSAGE };
  }

  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  // Deliberately the same error message whether the email doesn't exist
  // or the password is wrong — telling an attacker "that email isn't
  // registered" is a real information leak (account enumeration), not a
  // minor UX nicety to skip.
  if (!user) {
    return { error: INVALID_CREDENTIALS_MESSAGE };
  }

  const passwordMatches = await verifyPassword(password, user.passwordHash);
  if (!passwordMatches) {
    return { error: INVALID_CREDENTIALS_MESSAGE };
  }

  await createSession(user.id);
  return undefined;
}

/**
 * Bound to `useActionState` in the interactive login form (see
 * src/components/login-form.tsx) — returns an error to display inline
 * instead of throwing, since "wrong password" is an expected, everyday
 * outcome for a login form, not an exceptional one.
 */
export async function login(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const result = await authenticate(formData.get("email"), formData.get("password"));
  if (result) {
    return result;
  }
  redirect("/");
}

/**
 * The "quick demo sign-in" buttons on the login page submit through this
 * plain action instead — same authentication path underneath (still a
 * real email/password check, not a backdoor), just with known-good demo
 * credentials pre-filled as hidden form fields, so failure here would
 * mean a real bug rather than a normal user-facing case worth a nice
 * inline message for.
 */
export async function quickDemoLogin(formData: FormData) {
  const result = await authenticate(formData.get("email"), formData.get("password"));
  if (result) {
    throw new Error(result.error);
  }
  redirect("/");
}

export async function signup(
  _prevState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const name = formData.get("name");
  const email = formData.get("email");
  const password = formData.get("password");

  if (typeof name !== "string" || name.trim().length === 0) {
    return { error: "Name is required." };
  }
  if (typeof email !== "string" || email.trim().length === 0) {
    return { error: "Email is required." };
  }
  if (typeof password !== "string" || password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  const normalizedEmail = email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    return { error: "An account with that email already exists." };
  }

  const passwordHash = await hashPassword(password);
  // Self-registration always creates a CUSTOMER account. Agent and
  // manager accounts are provisioned internally in a real service desk —
  // nobody signs themselves up as an L2 support agent — so there's no
  // role field on this form to trust in the first place.
  const user = await prisma.user.create({
    data: { name: name.trim(), email: normalizedEmail, passwordHash, role: Role.CUSTOMER },
  });

  await createSession(user.id);
  redirect("/");
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}
