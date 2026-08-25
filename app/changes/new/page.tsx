import { redirect } from "next/navigation";
import { prisma } from "@/src/lib/prisma";
import { getActiveUser } from "@/src/lib/session";
import { getDemoSessionId, demoSessionFilter } from "@/src/lib/demo-session";
import { createChange } from "@/src/actions/changes";
import { CATEGORY_LABELS, CHANGE_TYPE_LABELS, CHANGE_RISK_LABELS, isAgentRole } from "@/src/types/itil";
import { IncidentCategory, ChangeType, ChangeRisk } from "@/app/generated/prisma/client";

export const dynamic = "force-dynamic";

export default async function NewChangePage({
  searchParams,
}: {
  searchParams: Promise<{ fromProblemId?: string }>;
}) {
  const { fromProblemId } = await searchParams;

  const activeUser = await getActiveUser();
  if (!activeUser) {
    redirect("/login");
  }
  if (!isAgentRole(activeUser.role)) {
    redirect("/");
  }

  const sourceProblem = fromProblemId
    ? await prisma.problem.findFirst({
        where: { id: fromProblemId, ...demoSessionFilter(await getDemoSessionId()) },
      })
    : null;

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-6 py-16 px-6">
      <div>
        <h1 className="text-xl font-semibold text-black dark:text-zinc-50">Log a New Change</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Raising this as {activeUser.name}.
        </p>
        <p className="mt-2 rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300">
          A Change is a formal, planned modification to something in the
          environment, a config change, a patch, a rollback. Standard
          changes are routine and auto-approved. Normal changes need
          manager approval before starting. Emergency changes can start
          right away, but still need approval recorded before they can be
          marked complete. This is internal only, customers never see
          changes.
        </p>
        {sourceProblem && (
          <p className="mt-2 rounded-lg border border-amber-100 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
            Creating this change from {sourceProblem.problemNumber}: it
            will be linked automatically once you submit.
          </p>
        )}
      </div>

      <form action={createChange} className="flex flex-col gap-4">
        {sourceProblem && (
          <input type="hidden" name="sourceProblemId" value={sourceProblem.id} />
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
            defaultValue={sourceProblem ? `Fix for: ${sourceProblem.title}` : ""}
            placeholder="Short summary of the change"
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
            rows={3}
            defaultValue={sourceProblem?.description ?? ""}
            placeholder="What is actually changing, and why?"
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
            defaultValue={sourceProblem?.category ?? ""}
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
          <label htmlFor="changeType" className="text-sm font-medium">
            Change type
          </label>
          <select
            id="changeType"
            name="changeType"
            required
            defaultValue=""
            className="rounded border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-zinc-900"
          >
            <option value="" disabled>
              Select a type...
            </option>
            {Object.values(ChangeType).map((value) => (
              <option key={value} value={value}>
                {CHANGE_TYPE_LABELS[value]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="risk" className="text-sm font-medium">
            Risk
          </label>
          <select
            id="risk"
            name="risk"
            required
            defaultValue=""
            className="rounded border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-zinc-900"
          >
            <option value="" disabled>
              Select a risk level...
            </option>
            {Object.values(ChangeRisk).map((value) => (
              <option key={value} value={value}>
                {CHANGE_RISK_LABELS[value]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="implementationPlan" className="text-sm font-medium">
            Implementation plan
          </label>
          <textarea
            id="implementationPlan"
            name="implementationPlan"
            required
            rows={3}
            placeholder="Exactly what steps will be taken to make this change?"
            className="rounded border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-zinc-900"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="backoutPlan" className="text-sm font-medium">
            Backout plan
          </label>
          <textarea
            id="backoutPlan"
            name="backoutPlan"
            required
            rows={3}
            placeholder="If this goes wrong, exactly how does it get undone?"
            className="rounded border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-zinc-900"
          />
        </div>

        <div className="flex gap-3">
          <div className="flex flex-1 flex-col gap-1">
            <label htmlFor="plannedStart" className="text-sm font-medium">
              Planned start
            </label>
            <input
              id="plannedStart"
              name="plannedStart"
              type="datetime-local"
              required
              className="rounded border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-zinc-900"
            />
          </div>
          <div className="flex flex-1 flex-col gap-1">
            <label htmlFor="plannedEnd" className="text-sm font-medium">
              Planned end
            </label>
            <input
              id="plannedEnd"
              name="plannedEnd"
              type="datetime-local"
              required
              className="rounded border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-zinc-900"
            />
          </div>
        </div>

        <button
          type="submit"
          className="rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
        >
          Log Change
        </button>
      </form>
    </main>
  );
}
