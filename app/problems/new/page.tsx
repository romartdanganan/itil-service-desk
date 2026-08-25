import { redirect } from "next/navigation";
import { prisma } from "@/src/lib/prisma";
import { getActiveUser } from "@/src/lib/session";
import { getDemoSessionId, demoSessionFilter } from "@/src/lib/demo-session";
import { createProblem } from "@/src/actions/problems";
import {
  CATEGORY_LABELS,
  IMPACT_LABELS,
  URGENCY_LABELS,
  isAgentRole,
} from "@/src/types/itil";
import { IncidentCategory, Impact, Urgency } from "@/app/generated/prisma/client";

export const dynamic = "force-dynamic";

export default async function NewProblemPage({
  searchParams,
}: {
  searchParams: Promise<{ fromIncidentId?: string }>;
}) {
  const { fromIncidentId } = await searchParams;

  const activeUser = await getActiveUser();
  if (!activeUser) {
    redirect("/login");
  }
  if (!isAgentRole(activeUser.role)) {
    redirect("/");
  }

  const sourceIncident = fromIncidentId
    ? await prisma.incident.findFirst({
        where: { id: fromIncidentId, ...demoSessionFilter(await getDemoSessionId()) },
      })
    : null;

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-6 py-16 px-6">
      <div>
        <h1 className="text-xl font-semibold text-black dark:text-zinc-50">
          Log a New Problem
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Raising this as {activeUser.name}.
        </p>
        <p className="mt-2 rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300">
          A Problem is the underlying root cause behind one or more
          incidents. Use this when a pattern shows up (several tickets
          about the same thing) or a single incident is serious enough to
          need its own root-cause investigation. This is internal only,
          customers never see problems.
        </p>
        {sourceIncident && (
          <p className="mt-2 rounded-lg border border-amber-100 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
            Creating this problem from {sourceIncident.ticketNumber}: it
            will be linked automatically once you submit.
          </p>
        )}
      </div>

      <form action={createProblem} className="flex flex-col gap-4">
        {sourceIncident && (
          <input type="hidden" name="sourceIncidentId" value={sourceIncident.id} />
        )}

        <div className="flex flex-col gap-1">
          <label htmlFor="title" className="text-sm font-medium">
            Title
          </label>
          <input
            id="title"
            name="title"
            type="text"
            required
            defaultValue={sourceIncident ? `Root cause of: ${sourceIncident.title}` : ""}
            placeholder="Short summary of the underlying problem"
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
            defaultValue={sourceIncident?.description ?? ""}
            placeholder="What pattern or root cause are you investigating? Describe the recurring issue, not just this one instance."
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
            defaultValue={sourceIncident?.category ?? ""}
            className="rounded border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-zinc-900"
          >
            <option value="" disabled>
              Select a category...
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
            defaultValue={sourceIncident?.impact ?? ""}
            className="rounded border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-zinc-900"
          >
            <option value="" disabled>
              Select impact...
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
            defaultValue={sourceIncident?.urgency ?? ""}
            className="rounded border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-zinc-900"
          >
            <option value="" disabled>
              Select urgency...
            </option>
            {Object.values(Urgency).map((value) => (
              <option key={value} value={value}>
                {URGENCY_LABELS[value]}
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          className="rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
        >
          Log Problem
        </button>
      </form>
    </main>
  );
}
