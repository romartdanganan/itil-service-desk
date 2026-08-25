import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/src/lib/prisma";
import { getActiveUser } from "@/src/lib/session";
import {
  CATEGORY_LABELS,
  IMPACT_LABELS,
  URGENCY_LABELS,
  PRIORITY_LABELS,
  ROLE_LABELS,
  isAgentRole,
} from "@/src/types/itil";
import { Role } from "@/app/generated/prisma/client";
import {
  takeProblem,
  reassignProblem,
  recordWorkaround,
  resolveProblem,
  closeProblem,
  addProblemComment,
} from "@/src/actions/problem-workflow";
import { IncidentListItem } from "@/src/components/incident-list";
import { ChangeListItem } from "@/src/components/change-list";

export const dynamic = "force-dynamic";

function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "warning" | "danger" | "success";
}) {
  const toneClasses: Record<string, string> = {
    neutral: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
    warning: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
    danger: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
    success: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  };
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${toneClasses[tone]}`}>
      {children}
    </span>
  );
}

export default async function ProblemDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { id } = await params;
  const { created } = await searchParams;

  const activeUser = await getActiveUser();
  if (!activeUser) {
    redirect("/login");
  }
  if (!isAgentRole(activeUser.role)) {
    redirect("/");
  }

  const [problem, agents, changes] = await Promise.all([
    prisma.problem.findUnique({
      where: { id },
      include: {
        owner: true,
        raisedBy: true,
        incidents: {
          include: { assignee: true, requester: true },
          orderBy: { createdAt: "desc" },
        },
        activities: { include: { actor: true }, orderBy: { createdAt: "asc" } },
      },
    }),
    prisma.user.findMany({
      where: { role: { in: [Role.AGENT_L1, Role.AGENT_L2, Role.AGENT_L3] } },
      orderBy: { name: "asc" },
    }),
    prisma.change.findMany({
      where: { sourceProblemId: id },
      include: { requestedBy: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  if (!problem) {
    notFound();
  }

  const isOpen = problem.status !== "RESOLVED" && problem.status !== "CLOSED";
  const canManage = activeUser.role === Role.MANAGER;
  const statusTone =
    problem.status === "KNOWN_ERROR"
      ? "warning"
      : problem.status === "RESOLVED" || problem.status === "CLOSED"
        ? "success"
        : "neutral";

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-3xl flex-col gap-6 py-16 px-6">
        <Link href="/problems" className="text-sm text-zinc-500 underline dark:text-zinc-400">
          Back to all problems
        </Link>

        {created && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm dark:border-emerald-900 dark:bg-emerald-950/40">
            <p className="font-semibold text-emerald-900 dark:text-emerald-300">
              Logged as {problem.problemNumber}
            </p>
            <p className="mt-1 text-emerald-800 dark:text-emerald-400">
              This is your new problem. Take it to start investigating, or
              leave it unowned for any agent to pick up from the Problems
              list.
            </p>
          </div>
        )}

        <div className="rounded-lg border border-black/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-medium text-zinc-500">{problem.problemNumber}</span>
            <div className="flex gap-2">
              <Badge>{PRIORITY_LABELS[problem.priority]}</Badge>
              <Badge tone={statusTone}>{problem.status.replace("_", " ")}</Badge>
            </div>
          </div>

          <h1 className="mt-2 text-xl font-semibold text-black dark:text-zinc-50">
            {problem.title}
          </h1>
          <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">
            {problem.description}
          </p>

          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-zinc-500">Category</dt>
              <dd className="text-black dark:text-zinc-50">{CATEGORY_LABELS[problem.category]}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Impact</dt>
              <dd className="text-black dark:text-zinc-50">{IMPACT_LABELS[problem.impact]}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Urgency</dt>
              <dd className="text-black dark:text-zinc-50">{URGENCY_LABELS[problem.urgency]}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Raised by</dt>
              <dd className="text-black dark:text-zinc-50">{problem.raisedBy.name}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Owner</dt>
              <dd className="text-black dark:text-zinc-50">
                {problem.owner
                  ? `${problem.owner.name} (${ROLE_LABELS[problem.owner.role]})`
                  : "Unowned"}
              </dd>
            </div>
          </dl>

          {problem.workaround && (
            <div className="mt-4 rounded-md bg-amber-50 p-3 text-sm dark:bg-amber-950/40">
              <p className="font-medium text-amber-900 dark:text-amber-300">
                Known error workaround
              </p>
              <p className="mt-1 text-amber-800 dark:text-amber-400">{problem.workaround}</p>
            </div>
          )}

          {problem.rootCause && (
            <div className="mt-4 rounded-md bg-emerald-50 p-3 text-sm dark:bg-emerald-950/40">
              <p className="font-medium text-emerald-900 dark:text-emerald-300">Root cause</p>
              <p className="mt-1 text-emerald-800 dark:text-emerald-400">{problem.rootCause}</p>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4">
          {isOpen && (
            <div className="rounded-lg border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
              <h2 className="text-sm font-semibold text-black dark:text-zinc-50">
                Work this problem
              </h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {problem.ownerId !== activeUser.id && (
                  <form action={takeProblem}>
                    <input type="hidden" name="problemId" value={problem.id} />
                    <button className="rounded-full bg-foreground px-4 py-1.5 text-xs font-medium text-background">
                      Take problem
                    </button>
                  </form>
                )}
              </div>

              <form action={recordWorkaround} className="mt-3 flex flex-col gap-2">
                <input type="hidden" name="problemId" value={problem.id} />
                <label className="text-xs font-medium text-zinc-500">
                  Record a workaround (makes this a Known Error)
                </label>
                <textarea
                  name="workaround"
                  required
                  rows={2}
                  defaultValue={problem.workaround ?? ""}
                  placeholder="What can agents do right now to work around this, before a permanent fix exists?"
                  className="rounded border border-black/10 bg-white px-3 py-1.5 text-xs dark:border-white/10 dark:bg-zinc-900"
                />
                <button className="self-start rounded-full border border-black/10 px-4 py-1.5 text-xs font-medium dark:border-white/10">
                  Save workaround
                </button>
              </form>

              <form action={resolveProblem} className="mt-3 flex flex-col gap-2">
                <input type="hidden" name="problemId" value={problem.id} />
                <label className="text-xs font-medium text-zinc-500">
                  Resolve with the permanent fix
                </label>
                <textarea
                  name="rootCause"
                  required
                  rows={2}
                  placeholder="What was the root cause, and what fixed it for good?"
                  className="rounded border border-black/10 bg-white px-3 py-1.5 text-xs dark:border-white/10 dark:bg-zinc-900"
                />
                <button className="self-start rounded-full bg-foreground px-4 py-1.5 text-xs font-medium text-background">
                  Mark resolved
                </button>
              </form>
            </div>
          )}

          {canManage && isOpen && agents.length > 0 && (
            <div className="rounded-lg border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
              <h2 className="text-sm font-semibold text-black dark:text-zinc-50">Reassign</h2>
              <form action={reassignProblem} className="mt-3 flex gap-2">
                <input type="hidden" name="problemId" value={problem.id} />
                <select
                  name="ownerId"
                  required
                  defaultValue=""
                  className="flex-1 rounded border border-black/10 bg-white px-3 py-1.5 text-xs dark:border-white/10 dark:bg-zinc-900"
                >
                  <option value="" disabled>
                    Choose an agent...
                  </option>
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name} ({ROLE_LABELS[agent.role]})
                    </option>
                  ))}
                </select>
                <button className="rounded-full border border-black/10 px-4 py-1.5 text-xs font-medium dark:border-white/10">
                  Assign
                </button>
              </form>
            </div>
          )}

          {canManage && problem.status === "RESOLVED" && (
            <div className="rounded-lg border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
              <h2 className="text-sm font-semibold text-black dark:text-zinc-50">
                Close this problem
              </h2>
              <p className="mt-1 text-xs text-zinc-500">
                Closing is a manager-only governance step. Unlike an
                incident, there is no customer to confirm the fix held.
              </p>
              <form action={closeProblem} className="mt-3">
                <input type="hidden" name="problemId" value={problem.id} />
                <button className="rounded-full bg-foreground px-4 py-1.5 text-xs font-medium text-background">
                  Close problem
                </button>
              </form>
            </div>
          )}

          <div className="rounded-lg border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
            <h2 className="text-sm font-semibold text-black dark:text-zinc-50">Add a comment</h2>
            <form action={addProblemComment} className="mt-3 flex flex-col gap-2">
              <input type="hidden" name="problemId" value={problem.id} />
              <textarea
                name="message"
                required
                rows={2}
                placeholder="Add an update or question..."
                className="rounded border border-black/10 bg-white px-3 py-1.5 text-xs dark:border-white/10 dark:bg-zinc-900"
              />
              <button className="self-start rounded-full border border-black/10 px-4 py-1.5 text-xs font-medium dark:border-white/10">
                Post comment
              </button>
            </form>
          </div>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-black dark:text-zinc-50">
            Linked incidents ({problem.incidents.length})
          </h2>
          {problem.incidents.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              No incidents linked yet. Link one from its own detail page.
            </p>
          ) : (
            <ul className="mt-3 flex flex-col gap-3">
              {problem.incidents.map((incident) => (
                <IncidentListItem key={incident.id} incident={incident} />
              ))}
            </ul>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-black dark:text-zinc-50">
              Changes raised from this problem ({changes.length})
            </h2>
            <Link
              href={`/changes/new?fromProblemId=${problem.id}`}
              className="rounded-full border border-black/10 px-3 py-1 text-xs font-medium dark:border-white/10"
            >
              Raise a change
            </Link>
          </div>
          {changes.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              No changes raised yet. Once the fix is known, raise a change
              to actually deliver it.
            </p>
          ) : (
            <ul className="mt-3 flex flex-col gap-3">
              {changes.map((c) => (
                <ChangeListItem key={c.id} change={c} />
              ))}
            </ul>
          )}
        </div>

        <div>
          <h2 className="text-sm font-semibold text-black dark:text-zinc-50">Activity</h2>
          <ol className="mt-3 flex flex-col gap-3">
            {problem.activities.map((activity) => (
              <li
                key={activity.id}
                className="rounded-md border border-black/10 bg-white p-3 text-sm dark:border-white/10 dark:bg-zinc-900"
              >
                <div className="flex items-center justify-between text-xs text-zinc-500">
                  <span>
                    {activity.actor.name}, {activity.type.replace("_", " ")}
                  </span>
                  <span>{activity.createdAt.toLocaleString()}</span>
                </div>
                <p className="mt-1 text-black dark:text-zinc-50">{activity.message}</p>
              </li>
            ))}
          </ol>
        </div>
      </main>
    </div>
  );
}
