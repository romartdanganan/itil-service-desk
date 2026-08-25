import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/src/lib/prisma";
import { getActiveUser } from "@/src/lib/session";
import { getDemoSessionId, demoSessionFilter } from "@/src/lib/demo-session";
import {
  CATEGORY_LABELS,
  CHANGE_TYPE_LABELS,
  CHANGE_RISK_LABELS,
  isAgentRole,
  canStartWithoutApproval,
} from "@/src/types/itil";
import { Role } from "@/app/generated/prisma/client";
import {
  approveChange,
  rejectChange,
  startChange,
  completeChange,
  failChange,
  closeChange,
  addChangeComment,
} from "@/src/actions/change-workflow";

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

export default async function ChangeDetailPage({
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

  // findFirst, not findUnique, same reason as the other detail pages:
  // lets the demo-session check ride alongside `id` in one query.
  const change = await prisma.change.findFirst({
    where: { id, ...demoSessionFilter(await getDemoSessionId()) },
    include: {
      requestedBy: true,
      approvedBy: true,
      implementedBy: true,
      sourceProblem: true,
      activities: { include: { actor: true }, orderBy: { createdAt: "asc" } },
    },
  });

  if (!change) {
    notFound();
  }

  const canManage = activeUser.role === Role.MANAGER;
  const canStart =
    change.status === "APPROVED" ||
    (change.status === "REQUESTED" && canStartWithoutApproval(change.changeType));
  const needsRetroactiveApproval =
    change.status === "IN_PROGRESS" && change.changeType === "EMERGENCY" && !change.approvedById;
  const statusTone =
    change.status === "COMPLETED"
      ? "success"
      : change.status === "REJECTED" || change.status === "FAILED"
        ? "danger"
        : change.status === "IN_PROGRESS"
          ? "warning"
          : "neutral";

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-3xl flex-col gap-6 py-16 px-6">
        <Link href="/changes" className="text-sm text-zinc-500 underline dark:text-zinc-400">
          Back to all changes
        </Link>

        {created && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm dark:border-emerald-900 dark:bg-emerald-950/40">
            <p className="font-semibold text-emerald-900 dark:text-emerald-300">
              Logged as {change.changeNumber}
            </p>
            <p className="mt-1 text-emerald-800 dark:text-emerald-400">
              {change.changeType === "STANDARD"
                ? "Standard changes are auto-approved, this one's ready to start whenever you are."
                : change.changeType === "EMERGENCY"
                  ? "Emergency changes can start right away, but still need approval recorded before they can be marked complete."
                  : "This is waiting on manager approval before it can start."}
            </p>
          </div>
        )}

        <div className="rounded-lg border border-black/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-medium text-zinc-500">{change.changeNumber}</span>
            <div className="flex gap-2">
              {change.risk === "HIGH" && <Badge tone="danger">High risk</Badge>}
              <Badge>{change.changeType}</Badge>
              <Badge tone={statusTone}>{change.status.replace("_", " ")}</Badge>
            </div>
          </div>

          <h1 className="mt-2 text-xl font-semibold text-black dark:text-zinc-50">
            {change.title}
          </h1>
          <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">
            {change.description}
          </p>

          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-zinc-500">Category</dt>
              <dd className="text-black dark:text-zinc-50">{CATEGORY_LABELS[change.category]}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Type</dt>
              <dd className="text-black dark:text-zinc-50">
                {CHANGE_TYPE_LABELS[change.changeType]}
              </dd>
            </div>
            <div>
              <dt className="text-zinc-500">Risk</dt>
              <dd className="text-black dark:text-zinc-50">{CHANGE_RISK_LABELS[change.risk]}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Planned window</dt>
              <dd className="text-black dark:text-zinc-50">
                {change.plannedStart.toLocaleString()} to {change.plannedEnd.toLocaleString()}
              </dd>
            </div>
            <div>
              <dt className="text-zinc-500">Requested by</dt>
              <dd className="text-black dark:text-zinc-50">{change.requestedBy.name}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Approved by</dt>
              <dd className="text-black dark:text-zinc-50">
                {change.approvedBy ? change.approvedBy.name : "Not yet"}
              </dd>
            </div>
            <div>
              <dt className="text-zinc-500">Implemented by</dt>
              <dd className="text-black dark:text-zinc-50">
                {change.implementedBy ? change.implementedBy.name : "Not started"}
              </dd>
            </div>
            {change.sourceProblem && (
              <div>
                <dt className="text-zinc-500">Addresses</dt>
                <dd className="text-black dark:text-zinc-50">
                  <Link
                    href={`/problems/${change.sourceProblem.id}`}
                    className="underline"
                  >
                    {change.sourceProblem.problemNumber}
                  </Link>
                </dd>
              </div>
            )}
          </dl>

          <div className="mt-4 rounded-md bg-blue-50 p-3 text-sm dark:bg-blue-950/40">
            <p className="font-medium text-blue-900 dark:text-blue-300">Implementation plan</p>
            <p className="mt-1 whitespace-pre-wrap text-blue-800 dark:text-blue-400">
              {change.implementationPlan}
            </p>
          </div>

          <div className="mt-4 rounded-md bg-amber-50 p-3 text-sm dark:bg-amber-950/40">
            <p className="font-medium text-amber-900 dark:text-amber-300">
              Backout plan, if this goes wrong
            </p>
            <p className="mt-1 whitespace-pre-wrap text-amber-800 dark:text-amber-400">
              {change.backoutPlan}
            </p>
          </div>

          {change.approvalNotes && (
            <div className="mt-4 rounded-md bg-zinc-100 p-3 text-sm dark:bg-zinc-800">
              <p className="font-medium text-black dark:text-zinc-50">Approval notes</p>
              <p className="mt-1 text-zinc-700 dark:text-zinc-300">{change.approvalNotes}</p>
            </div>
          )}

          {change.postImplementationNotes && (
            <div
              className={`mt-4 rounded-md p-3 text-sm ${
                change.status === "FAILED"
                  ? "bg-red-50 dark:bg-red-950/40"
                  : "bg-emerald-50 dark:bg-emerald-950/40"
              }`}
            >
              <p
                className={`font-medium ${
                  change.status === "FAILED"
                    ? "text-red-900 dark:text-red-300"
                    : "text-emerald-900 dark:text-emerald-300"
                }`}
              >
                Post-implementation notes
              </p>
              <p
                className={`mt-1 ${
                  change.status === "FAILED"
                    ? "text-red-800 dark:text-red-400"
                    : "text-emerald-800 dark:text-emerald-400"
                }`}
              >
                {change.postImplementationNotes}
              </p>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4">
          {canManage && change.status === "REQUESTED" && (
            <div className="rounded-lg border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
              <h2 className="text-sm font-semibold text-black dark:text-zinc-50">
                Approve or reject
              </h2>
              <form action={approveChange} className="mt-3 flex flex-col gap-2">
                <input type="hidden" name="changeId" value={change.id} />
                <input
                  type="text"
                  name="approvalNotes"
                  placeholder="Approval notes (optional)"
                  className="rounded border border-black/10 bg-white px-3 py-1.5 text-xs dark:border-white/10 dark:bg-zinc-900"
                />
                <button className="self-start rounded-full bg-foreground px-4 py-1.5 text-xs font-medium text-background">
                  Approve
                </button>
              </form>
              <form action={rejectChange} className="mt-3 flex flex-col gap-2">
                <input type="hidden" name="changeId" value={change.id} />
                <input
                  type="text"
                  name="approvalNotes"
                  required
                  placeholder="Reason for rejecting"
                  className="rounded border border-black/10 bg-white px-3 py-1.5 text-xs dark:border-white/10 dark:bg-zinc-900"
                />
                <button className="self-start rounded-full border border-black/10 px-4 py-1.5 text-xs font-medium dark:border-white/10">
                  Reject
                </button>
              </form>
            </div>
          )}

          {canManage && needsRetroactiveApproval && (
            <div className="rounded-lg border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
              <h2 className="text-sm font-semibold text-black dark:text-zinc-50">
                Retroactive approval
              </h2>
              <p className="mt-1 text-xs text-zinc-500">
                This emergency change already started without waiting for
                approval. It can&apos;t be marked complete until that approval
                is recorded here.
              </p>
              <form action={approveChange} className="mt-3 flex flex-col gap-2">
                <input type="hidden" name="changeId" value={change.id} />
                <input
                  type="text"
                  name="approvalNotes"
                  placeholder="Approval notes (optional)"
                  className="rounded border border-black/10 bg-white px-3 py-1.5 text-xs dark:border-white/10 dark:bg-zinc-900"
                />
                <button className="self-start rounded-full bg-foreground px-4 py-1.5 text-xs font-medium text-background">
                  Approve retroactively
                </button>
              </form>
            </div>
          )}

          {isAgentRole(activeUser.role) && canStart && (
            <div className="rounded-lg border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
              <h2 className="text-sm font-semibold text-black dark:text-zinc-50">
                Start implementation
              </h2>
              {change.status === "REQUESTED" && (
                <p className="mt-1 text-xs text-zinc-500">
                  Emergency change, starting now without waiting for
                  approval. Approval will still need to be recorded before
                  this can be completed.
                </p>
              )}
              <form action={startChange} className="mt-3">
                <input type="hidden" name="changeId" value={change.id} />
                <button className="rounded-full bg-foreground px-4 py-1.5 text-xs font-medium text-background">
                  Start change
                </button>
              </form>
            </div>
          )}

          {isAgentRole(activeUser.role) && change.status === "IN_PROGRESS" && (
            <div className="rounded-lg border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
              <h2 className="text-sm font-semibold text-black dark:text-zinc-50">
                Record the outcome
              </h2>
              {needsRetroactiveApproval && (
                <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                  Needs retroactive approval (above) before it can be
                  completed or failed.
                </p>
              )}
              <form action={completeChange} className="mt-3 flex flex-col gap-2">
                <input type="hidden" name="changeId" value={change.id} />
                <textarea
                  name="postImplementationNotes"
                  required
                  rows={2}
                  placeholder="What happened? Confirm it worked as planned."
                  className="rounded border border-black/10 bg-white px-3 py-1.5 text-xs dark:border-white/10 dark:bg-zinc-900"
                />
                <button
                  disabled={needsRetroactiveApproval}
                  className="self-start rounded-full bg-foreground px-4 py-1.5 text-xs font-medium text-background disabled:opacity-50"
                >
                  Mark completed
                </button>
              </form>
              <form action={failChange} className="mt-3 flex flex-col gap-2">
                <input type="hidden" name="changeId" value={change.id} />
                <textarea
                  name="postImplementationNotes"
                  required
                  rows={2}
                  placeholder="What went wrong, and how was it rolled back?"
                  className="rounded border border-black/10 bg-white px-3 py-1.5 text-xs dark:border-white/10 dark:bg-zinc-900"
                />
                <button
                  disabled={needsRetroactiveApproval}
                  className="self-start rounded-full border border-red-200 px-4 py-1.5 text-xs font-medium text-red-800 disabled:opacity-50 dark:border-red-900 dark:text-red-300"
                >
                  Mark failed, rolled back
                </button>
              </form>
            </div>
          )}

          {canManage && (change.status === "COMPLETED" || change.status === "FAILED") && (
            <div className="rounded-lg border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
              <h2 className="text-sm font-semibold text-black dark:text-zinc-50">
                Close this change
              </h2>
              <p className="mt-1 text-xs text-zinc-500">
                Closing is a manager-only governance step, same as closing
                a problem.
              </p>
              <form action={closeChange} className="mt-3">
                <input type="hidden" name="changeId" value={change.id} />
                <button className="rounded-full bg-foreground px-4 py-1.5 text-xs font-medium text-background">
                  Close change
                </button>
              </form>
            </div>
          )}

          <div className="rounded-lg border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
            <h2 className="text-sm font-semibold text-black dark:text-zinc-50">Add a comment</h2>
            <form action={addChangeComment} className="mt-3 flex flex-col gap-2">
              <input type="hidden" name="changeId" value={change.id} />
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
          <h2 className="text-sm font-semibold text-black dark:text-zinc-50">Activity</h2>
          <ol className="mt-3 flex flex-col gap-3">
            {change.activities.map((activity) => (
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
