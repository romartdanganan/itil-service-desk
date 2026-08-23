"use client";

import { useActionState } from "react";
import { login } from "@/src/actions/auth";

// This needs to be a Client Component — `useActionState` is a React hook,
// and hooks only run in the browser. It's a deliberate, small exception
// to this app's usual "no client JS" pattern: showing "invalid email or
// password" inline, without a full page reload/error boundary, needs
// somewhere to hold that pending error state between the form submitting
// and the server responding.
export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="email" className="text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="rounded border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-zinc-900"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="password" className="text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="rounded border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-zinc-900"
        />
      </div>
      {state?.error && (
        <p className="text-sm text-red-700 dark:text-red-400">{state.error}</p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
