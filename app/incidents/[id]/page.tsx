import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/src/lib/prisma";
import { getActiveUser } from "@/src/lib/session";
import { getDemoSessionId, demoSessionFilter } from "@/src/lib/demo-session";
import {
  CATEGORY_LABELS,
  IMPACT_LABELS,
  URGENCY_LABELS,
  PRIORITY_LABELS,
  ROLE_LABELS,
  isAgentRole,
  getNextTier,
} from "@/src/types/itil";
import { Role } from "@/app/generated/prisma/client";
import {
  takeIncident,
  reassignIncident,
  escalateIncident,
  setIncidentHold,
  resolveIncident,
  closeIncident,
  addComment,
} from "@/src/actions/incident-workflow";
import { linkIncidentToProblem } from "@/src/actions/problems";

export const dynamic = "force-dynamic";

// Small server-only helper (no client JS needed) that turns a due date into
// a human sentence relative to *now* — "2h 15m left" or "overdue by 40m".
// Because this is a Server Component, "now" is the moment the page is
// rendered on the server; reloading the page is what refreshes it, there's
// no ticking clock in the browser (that would need a Client Component).
function describeDeadline(due: Date, now: Date): { text: string; overdue: boolean } {
  const diffMs = due.getTime() - now.getTime();
  const overdue = diffMs < 0;
  const totalMinutes = Math.round(Math.abs(diffMs) / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const duration = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  return { text: overdue ? `overdue by ${duration}` : `${duration} left`, overdue };
}

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

export default async function IncidentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { id } = await params;
  const { created } = await searchParams;

  const demoSessionId = await getDemoSessionId();

  const [incident, activeUser, agents] = await Promise.all([
    // findFirst, not findUnique: findUnique's `where` can't be extended
    // with the demo-session check alongside `id`. Guessing another
    // visitor's private incident id now 404s here, the same protection
    // the lists already have, not just a cosmetic filter on what shows up
    // in a queue.
    prisma.incident.findFirst({
      where: { id, ...demoSessionFilter(demoSessionId) },
      include: {
        requester: true,
        assignee: true,
        problem: true,
        activities: { include: { actor: true }, orderBy: { createdAt: "asc" } },
      },
    }),
    getActiveUser(),
    prisma.user.findMany({
      where: { role: { in: [Role.AGENT_L1, Role.AGENT_L2, Role.AGENT_L3] } },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!incident) {
    notFound();
  }
  if (!activeUser) {
    redirect("/login");
  }

  const now = new Date();
  const isOpen = incident.status !== "RESOLVED" && incident.status !== "CLOSED";
  const responseDeadline = describeDeadline(incident.slaResponseDueAt, now);
  const resolveDeadline = describeDeadline(incident.slaResolveDueAt, now);
  const nextTier = getNextTier(incident.assignee?.role ?? null);

  const canWorkTicket = activeUser ? isAgentRole(activeUser.role) : false;
  const canManage = activeUser?.role === Role.MANAGER;
  const canClose =
    activeUser &&
    incident.status === "RESOLVED" &&
    (activeUser.id === incident.requesterId || activeUser.role === Role.MANAGER);

  // Only fetched when there's actually a link form to populate: an agent
  // viewing an incident that isn't linked to a problem yet. Never exposed
  // to a customer, problem management is internal only.
  const openProblems =
    canWorkTicket && incident.problem === null
      ? await prisma.problem.findMany({
          where: { status: { not: "CLOSED" }, ...demoSessionFilter(demoSessionId) },
          orderBy: { createdAt: "desc" },
        })
      : [];

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-3xl flex-col gap-6 py-16 px-6">
        <Link href="/" className="text-sm text-zinc-500 underline dark:text-zinc-400">
          ← Back to all incidents
        </Link>

        {created && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm dark:border-emerald-900 dark:bg-emerald-950/40">
            <p className="font-semibold text-emerald-900 dark:text-emerald-300">
              ✓ Logged as {incident.ticketNumber}
            </p>
            <p className="mt-1 text-emerald-800 dark:text-emerald-400">
              This is your new ticket — bookmark this page, or find it
              again later on your dashboard under &quot;Open&quot;. It
              starts in the L1 (first-line) queue; an agent hasn&apos;t
              picked it up yet, so nothing else happens here until they
              do (or you switch to an agent role and take it yourself, to
              see the other side of the workflow).
            </p>
          </div>
        )}

        <div className="rounded-lg border border-black/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-medium text-zinc-500">{incident.ticketNumber}</span>
            <div className="flex gap-2">
              <Badge>{PRIORITY_LABELS[incident.priority]}</Badge>
              <Badge tone={incident.status === "CLOSED" ? "success" : "neutral"}>
                {incident.status.replace("_", " ")}
              </Badge>
            </div>
          </div>

          <h1 className="mt-2 text-xl font-semibold text-black dark:text-zinc-50">
            {incident.title}
          </h1>
          <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">
            {incident.description}
          </p>

          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-zinc-500">Category</dt>
              <dd className="text-black dark:text-zinc-50">{CATEGORY_LABELS[incident.category]}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Impact</dt>
              <dd className="text-black dark:text-zinc-50">{IMPACT_LABELS[incident.impact]}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Urgency</dt>
              <dd className="text-black dark:text-zinc-50">{URGENCY_LABELS[incident.urgency]}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Requester</dt>
              <dd className="text-black dark:text-zinc-50">{incident.requester.name}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Assigned to</dt>
              <dd className="text-black dark:text-zinc-50">
                {incident.assignee
                  ? `${incident.assignee.name} (${ROLE_LABELS[incident.assignee.role]})`
                  : "Unassigned"}
              </dd>
            </div>
          </dl>

          {/* SLA panel — the ticking commitment made the instant this ticket
              was raised (see calculateSlaDueDates in src/types/itil.ts).
              Response and Resolution are two separate promises, each with
              its own permanent breached/met verdict recorded the moment
              it's actually met — respondedAt on first contact, resolvedAt
              on resolution — rather than staying a "time left" countdown
              that goes stale once the moment has passed. */}
          <div className="mt-4 flex flex-col gap-2 rounded-md border border-black/10 p-3 text-sm dark:border-white/10">
            <div className="flex items-center justify-between">
              <span className="text-zinc-500">First response SLA</span>
              {incident.respondedAt ? (
                <Badge tone={incident.slaResponseBreached ? "danger" : "success"}>
                  {incident.slaResponseBreached ? "Breached" : "Met SLA"}
                </Badge>
              ) : isOpen ? (
                <Badge tone={responseDeadline.overdue ? "danger" : "neutral"}>
                  {responseDeadline.text}
                </Badge>
              ) : (
                <span className="text-zinc-500">—</span>
              )}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-zinc-500">Resolution SLA</span>
              {isOpen ? (
                <Badge tone={resolveDeadline.overdue ? "danger" : "warning"}>
                  {resolveDeadline.text}
                </Badge>
              ) : (
                <Badge tone={incident.slaResolveBreached ? "danger" : "success"}>
                  {incident.slaResolveBreached ? "Breached" : "Met SLA"}
                </Badge>
              )}
            </div>
          </div>

          {incident.resolutionNotes && (
            <div className="mt-4 rounded-md bg-emerald-50 p-3 text-sm dark:bg-emerald-950/40">
              <p className="font-medium text-emerald-900 dark:text-emerald-300">Resolution notes</p>
              <p className="mt-1 text-emerald-800 dark:text-emerald-400">{incident.resolutionNotes}</p>
            </div>
          )}
        </div>

        {/* Problem Management panel, internal only, agent/manager. Shows
            the linked problem (and its Known Error workaround, if one's
            been recorded) so an agent working this ticket doesn't have to
            re-diagnose something already understood, or lets them flag a
            pattern / link an existing problem if none is linked yet. */}
        {canWorkTicket && (
          <div className="rounded-lg border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
            <h2 className="text-sm font-semibold text-black dark:text-zinc-50">
              Problem management
            </h2>
            {incident.problem ? (
              <div className="mt-2">
                <Link
                  href={`/problems/${incident.problem.id}`}
                  className="text-sm font-medium text-black underline dark:text-zinc-50"
                >
                  {incident.problem.problemNumber}: {incident.problem.title}
                </Link>
                <p className="mt-1 text-xs text-zinc-500">
                  Status: {incident.problem.status.replace("_", " ")}
                </p>
                {incident.problem.workaround && (
                  <div className="mt-3 rounded-md bg-amber-50 p-3 text-sm dark:bg-amber-950/40">
                    <p className="font-medium text-amber-900 dark:text-amber-300">
                      Known workaround
                    </p>
                    <p className="mt-1 text-amber-800 dark:text-amber-400">
                      {incident.problem.workaround}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="mt-3 flex flex-col gap-3">
                <p className="text-xs text-zinc-500">
                  Not linked to a problem yet. Patterns are often only
                  noticed after several similar tickets, so this stays
                  available even once the ticket is resolved or closed.
                </p>
                {openProblems.length > 0 && (
                  <form action={linkIncidentToProblem} className="flex gap-2">
                    <input type="hidden" name="incidentId" value={incident.id} />
                    <select
                      name="problemId"
                      required
                      defaultValue=""
                      className="flex-1 rounded border border-black/10 bg-white px-3 py-1.5 text-xs dark:border-white/10 dark:bg-zinc-900"
                    >
                      <option value="" disabled>
                        Link to an existing problem...
                      </option>
                      {openProblems.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.problemNumber}: {p.title}
                        </option>
                      ))}
                    </select>
                    <button className="rounded-full border border-black/10 px-4 py-1.5 text-xs font-medium dark:border-white/10">
                      Link
                    </button>
                  </form>
                )}
                <Link
                  href={`/problems/new?fromIncidentId=${incident.id}`}
                  className="self-start rounded-full border border-black/10 px-4 py-1.5 text-xs font-medium dark:border-white/10"
                >
                  Flag as new problem
                </Link>
              </div>
            )}
          </div>
        )}

        {/* Actions — every form below posts straight to a Server Action in
            src/actions/incident-workflow.ts. Which forms render at all
            depends on activeUser's role and the ticket's current status:
            that's the ITIL permission model (who's allowed to do what to a
            ticket) enforced twice — here for UX, and again inside each
            action itself since a hidden button is not real security. */}
        {activeUser && (
          <div className="flex flex-col gap-4">
            {canWorkTicket && isOpen && (
              <div className="rounded-lg border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
                <h2 className="text-sm font-semibold text-black dark:text-zinc-50">Work this ticket</h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  {incident.assigneeId !== activeUser.id && (
                    <form action={takeIncident}>
                      <input type="hidden" name="incidentId" value={incident.id} />
                      <button className="rounded-full bg-foreground px-4 py-1.5 text-xs font-medium text-background">
                        Take ticket
                      </button>
                    </form>
                  )}

                  {incident.status === "IN_PROGRESS" && (
                    <form action={setIncidentHold}>
                      <input type="hidden" name="incidentId" value={incident.id} />
                      <input type="hidden" name="hold" value="true" />
                      <button className="rounded-full border border-black/10 px-4 py-1.5 text-xs font-medium dark:border-white/10">
                        Put on hold
                      </button>
                    </form>
                  )}
                  {incident.status === "ON_HOLD" && (
                    <form action={setIncidentHold}>
                      <input type="hidden" name="incidentId" value={incident.id} />
                      <input type="hidden" name="hold" value="false" />
                      <button className="rounded-full border border-black/10 px-4 py-1.5 text-xs font-medium dark:border-white/10">
                        Resume work
                      </button>
                    </form>
                  )}
                </div>

                {nextTier && (
                  <form action={escalateIncident} className="mt-3 flex flex-col gap-2">
                    <input type="hidden" name="incidentId" value={incident.id} />
                    <label className="text-xs font-medium text-zinc-500">
                      Escalate to {ROLE_LABELS[nextTier]}
                    </label>
                    <div className="flex gap-2">
                      <input
                        name="reason"
                        type="text"
                        required
                        placeholder="Reason for escalating…"
                        className="flex-1 rounded border border-black/10 bg-white px-3 py-1.5 text-xs dark:border-white/10 dark:bg-zinc-900"
                      />
                      <button className="rounded-full border border-black/10 px-4 py-1.5 text-xs font-medium dark:border-white/10">
                        Escalate
                      </button>
                    </div>
                  </form>
                )}

                <form action={resolveIncident} className="mt-3 flex flex-col gap-2">
                  <input type="hidden" name="incidentId" value={incident.id} />
                  <label className="text-xs font-medium text-zinc-500">Resolve this ticket</label>
                  <textarea
                    name="resolutionNotes"
                    required
                    rows={2}
                    placeholder="What fixed it?"
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
                <form action={reassignIncident} className="mt-3 flex gap-2">
                  <input type="hidden" name="incidentId" value={incident.id} />
                  <select
                    name="assigneeId"
                    required
                    defaultValue=""
                    className="flex-1 rounded border border-black/10 bg-white px-3 py-1.5 text-xs dark:border-white/10 dark:bg-zinc-900"
                  >
                    <option value="" disabled>
                      Choose an agent…
                    </option>
                    {agents.map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        {agent.name} — {ROLE_LABELS[agent.role]}
                      </option>
                    ))}
                  </select>
                  <button className="rounded-full border border-black/10 px-4 py-1.5 text-xs font-medium dark:border-white/10">
                    Assign
                  </button>
                </form>
              </div>
            )}

            {canClose && (
              <div className="rounded-lg border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
                <h2 className="text-sm font-semibold text-black dark:text-zinc-50">
                  Confirm the fix
                </h2>
                <p className="mt-1 text-xs text-zinc-500">
                  Closing confirms the resolution actually worked. This is the
                  last step in the incident lifecycle.
                </p>
                <form action={closeIncident} className="mt-3">
                  <input type="hidden" name="incidentId" value={incident.id} />
                  <button className="rounded-full bg-foreground px-4 py-1.5 text-xs font-medium text-background">
                    Close ticket
                  </button>
                </form>
              </div>
            )}

            <div className="rounded-lg border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
              <h2 className="text-sm font-semibold text-black dark:text-zinc-50">Add a comment</h2>
              <form action={addComment} className="mt-3 flex flex-col gap-2">
                <input type="hidden" name="incidentId" value={incident.id} />
                <textarea
                  name="message"
                  required
                  rows={2}
                  placeholder="Add an update or question…"
                  className="rounded border border-black/10 bg-white px-3 py-1.5 text-xs dark:border-white/10 dark:bg-zinc-900"
                />
                <button className="self-start rounded-full border border-black/10 px-4 py-1.5 text-xs font-medium dark:border-white/10">
                  Post comment
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Activity timeline — the audit trail. Every action above ends by
            writing one of these rows, which is why the timeline and the
            ticket's current state can never drift apart: it's the same
            transaction. */}
        <div>
          <h2 className="text-sm font-semibold text-black dark:text-zinc-50">Activity</h2>
          <ol className="mt-3 flex flex-col gap-3">
            {incident.activities.map((activity) => (
              <li
                key={activity.id}
                className="rounded-md border border-black/10 bg-white p-3 text-sm dark:border-white/10 dark:bg-zinc-900"
              >
                <div className="flex items-center justify-between text-xs text-zinc-500">
                  <span>
                    {activity.actor.name} · {activity.type.replace("_", " ")}
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
