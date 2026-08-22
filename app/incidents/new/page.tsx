import Link from "next/link";
import { getActiveUser } from "@/src/lib/session";
import { createIncident } from "@/src/actions/incidents";
import {
  CATEGORY_LABELS,
  IMPACT_LABELS,
  URGENCY_LABELS,
} from "@/src/types/itil";
import { IncidentCategory, Impact, Urgency } from "@/app/generated/prisma/client";

// This file lives at app/incidents/new/page.tsx. In the App Router, the
// FOLDER PATH under app/ *is* the URL: this page is served at /incidents/new.
// There's no routes.js or config file listing URLs anywhere — the
// filesystem itself is the router.
export const dynamic = "force-dynamic";

export default async function NewIncidentPage() {
  const activeUser = await getActiveUser();

  if (!activeUser) {
    return (
      <main className="mx-auto flex w-full max-w-lg flex-col gap-4 py-16 px-6">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Pick a user from &quot;Viewing as&quot; at the top of the page
          before logging an incident — every ticket needs a requester.
        </p>
        <Link href="/" className="text-sm underline">
          Back to incidents
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-6 py-16 px-6">
      <div>
        <h1 className="text-xl font-semibold text-black dark:text-zinc-50">
          Log a New Incident
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Logging as {activeUser.name}.
        </p>
      </div>

      {/* The form's `action` points straight at a Server Action, so
          submitting this form makes a network request to server code —
          no onSubmit handler, no client-side fetch(), and the page still
          works even if JavaScript fails to load in the browser. */}
      <form action={createIncident} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="title" className="text-sm font-medium">
            Title
          </label>
          <input
            id="title"
            name="title"
            type="text"
            required
            placeholder="Short summary of the problem"
            className="rounded border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-zinc-900"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="description" className="text-sm font-medium">
            Description
          </label>
          <textarea
            id="description"
            name="description"
            required
            rows={4}
            placeholder="What's happening? What have you already tried?"
            className="rounded border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-zinc-900"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="category" className="text-sm font-medium">
            Category
          </label>
          <select
            id="category"
            name="category"
            required
            defaultValue=""
            className="rounded border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-zinc-900"
          >
            <option value="" disabled>
              Select a category…
            </option>
            {Object.values(IncidentCategory).map((value) => (
              <option key={value} value={value}>
                {CATEGORY_LABELS[value]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="impact" className="text-sm font-medium">
            Impact
          </label>
          <select
            id="impact"
            name="impact"
            required
            defaultValue=""
            className="rounded border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-zinc-900"
          >
            <option value="" disabled>
              Select impact…
            </option>
            {Object.values(Impact).map((value) => (
              <option key={value} value={value}>
                {IMPACT_LABELS[value]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="urgency" className="text-sm font-medium">
            Urgency
          </label>
          <select
            id="urgency"
            name="urgency"
            required
            defaultValue=""
            className="rounded border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-zinc-900"
          >
            <option value="" disabled>
              Select urgency…
            </option>
            {Object.values(Urgency).map((value) => (
              <option key={value} value={value}>
                {URGENCY_LABELS[value]}
              </option>
            ))}
          </select>
        </div>

        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          Priority and SLA deadlines are calculated automatically from
          Impact and Urgency once you submit — that&apos;s the ITIL
          priority matrix, not a field you pick directly.
        </p>

        <button
          type="submit"
          className="rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
        >
          Log Incident
        </button>
      </form>
    </main>
  );
}
