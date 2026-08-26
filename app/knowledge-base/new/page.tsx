import { redirect } from "next/navigation";
import { prisma } from "@/src/lib/prisma";
import { getActiveUser } from "@/src/lib/session";
import { getDemoSessionId, demoSessionFilter } from "@/src/lib/demo-session";
import { createArticle } from "@/src/actions/knowledge";
import { CATEGORY_LABELS, isAgentRole } from "@/src/types/itil";
import { IncidentCategory } from "@/app/generated/prisma/client";

export const dynamic = "force-dynamic";

export default async function NewKnowledgeArticlePage({
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
        <h1 className="text-xl font-semibold text-black dark:text-zinc-50">
          Write a Knowledge Base Article
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Authoring this as {activeUser.name}.
        </p>
        <p className="mt-2 rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300">
          This starts as a draft. Publish it from its own page once it&apos;s
          ready to be searched and linked to a ticket.
        </p>
        {sourceProblem && (
          <p className="mt-2 rounded-lg border border-amber-100 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
            Writing this up from problem {sourceProblem.problemNumber}, its
            fix will be linked back to this article once you submit.
          </p>
        )}
      </div>

      <form action={createArticle} className="flex flex-col gap-4">
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
            defaultValue={sourceProblem?.title ?? ""}
            placeholder="Short summary of what this article covers"
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
          <label htmlFor="symptoms" className="text-sm font-medium">
            Symptoms
          </label>
          <textarea
            id="symptoms"
            name="symptoms"
            required
            rows={3}
            defaultValue={sourceProblem?.description ?? ""}
            placeholder="What does this look like? How would someone describe it, or search for it?"
            className="rounded border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-zinc-900"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="solution" className="text-sm font-medium">
            Solution
          </label>
          <textarea
            id="solution"
            name="solution"
            required
            rows={5}
            defaultValue={sourceProblem?.workaround ?? sourceProblem?.rootCause ?? ""}
            placeholder="Write the fix as steps an agent can follow and hand off directly."
            className="rounded border border-black/10 bg-white px-3 py-2 text-sm dark:border-white/10 dark:bg-zinc-900"
          />
        </div>

        <button
          type="submit"
          className="rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
        >
          Save Draft
        </button>
      </form>
    </main>
  );
}
