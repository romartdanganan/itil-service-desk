import { redirect } from "next/navigation";
import { prisma } from "@/src/lib/prisma";
import { getActiveUser } from "@/src/lib/session";
import { getDemoSessionId, demoSessionFilter } from "@/src/lib/demo-session";
import { CATEGORY_LABELS, PRIORITY_LABELS, isAgentRole } from "@/src/types/itil";
import { IncidentCategory, Priority, ProblemStatus } from "@/app/generated/prisma/client";
import type { Prisma } from "@/app/generated/prisma/client";
import { ProblemGroup, ProblemPageHeader } from "@/src/components/problem-list";

export const dynamic = "force-dynamic";

const STATUS_OPTIONS = Object.values(ProblemStatus);
const PRIORITY_OPTIONS = Object.values(Priority);

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

// Browse/search every Problem, agent/manager only (never customer-facing,
// unlike /incidents). No tier-scoped visibility here either: any agent or
// manager can see and work any Problem, see the scope note in
// prisma/schema.prisma on Problem.
export default async function ProblemsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const q = firstValue(params.q)?.trim() ?? "";
  const statusFilter = firstValue(params.status) ?? "";
  const priorityFilter = firstValue(params.priority) ?? "";
  const categoryFilter = firstValue(params.category) ?? "";

  const activeUser = await getActiveUser();
  if (!activeUser) {
    redirect("/login");
  }
  if (!isAgentRole(activeUser.role)) {
    redirect("/");
  }

  const demoSessionId = await getDemoSessionId();
  const filters: Prisma.ProblemWhereInput[] = [demoSessionFilter(demoSessionId)];
  if (q.length > 0) {
    filters.push({
      OR: [
        { problemNumber: { contains: q, mode: "insensitive" } },
        { title: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
      ],
    });
  }
  if (STATUS_OPTIONS.includes(statusFilter as ProblemStatus)) {
    filters.push({ status: statusFilter as ProblemStatus });
  }
  if (PRIORITY_OPTIONS.includes(priorityFilter as Priority)) {
    filters.push({ priority: priorityFilter as Priority });
  }
  if (Object.values(IncidentCategory).includes(categoryFilter as IncidentCategory)) {
    filters.push({ category: categoryFilter as IncidentCategory });
  }

  const [unowned, problems] = await Promise.all([
    prisma.problem.findMany({
      where: { ownerId: null, status: { not: "CLOSED" }, ...demoSessionFilter(demoSessionId) },
      orderBy: { createdAt: "asc" },
      include: { owner: true, raisedBy: true, _count: { select: { incidents: true } } },
    }),
    prisma.problem.findMany({
      where: { AND: filters },
      orderBy: { createdAt: "desc" },
      include: { owner: true, raisedBy: true, _count: { select: { incidents: true } } },
    }),
  ]);

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-3xl flex-col gap-6 py-16 px-6">
        <ProblemPageHeader
          title="Problem Management"
          subtitle="Investigate root causes behind incidents, agent and manager only."
        />

        <form className="flex flex-wrap gap-2 rounded-lg border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Search title, description, or problem number..."
            className="min-w-[200px] flex-1 rounded border border-black/10 bg-white px-3 py-1.5 text-sm dark:border-white/10 dark:bg-zinc-900"
          />
          <select
            name="status"
            defaultValue={statusFilter}
            className="rounded border border-black/10 bg-white px-3 py-1.5 text-sm dark:border-white/10 dark:bg-zinc-900"
          >
            <option value="">Any status</option>
            {STATUS_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {value.replace("_", " ")}
              </option>
            ))}
          </select>
          <select
            name="priority"
            defaultValue={priorityFilter}
            className="rounded border border-black/10 bg-white px-3 py-1.5 text-sm dark:border-white/10 dark:bg-zinc-900"
          >
            <option value="">Any priority</option>
            {PRIORITY_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {PRIORITY_LABELS[value]}
              </option>
            ))}
          </select>
          <select
            name="category"
            defaultValue={categoryFilter}
            className="rounded border border-black/10 bg-white px-3 py-1.5 text-sm dark:border-white/10 dark:bg-zinc-900"
          >
            <option value="">Any category</option>
            {Object.values(IncidentCategory).map((value) => (
              <option key={value} value={value}>
                {CATEGORY_LABELS[value]}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-full bg-foreground px-4 py-1.5 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
          >
            Search
          </button>
          {(q || statusFilter || priorityFilter || categoryFilter) && (
            <a
              href="/problems"
              className="rounded-full border border-black/10 px-4 py-1.5 text-sm font-medium dark:border-white/10"
            >
              Clear
            </a>
          )}
        </form>

        <ProblemGroup
          title="Unowned, needs an owner"
          emptyMessage="Nothing waiting for an owner right now."
          problems={unowned}
        />

        <ProblemGroup
          title="Results"
          emptyMessage="No problems match these filters."
          problems={problems}
        />
      </main>
    </div>
  );
}
