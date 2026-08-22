import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/src/lib/prisma";
import { getActiveUser } from "@/src/lib/session";
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
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [incident, activeUser, agents] = await Promise.all([
    prisma.incident.findUnique({
      where: { id },
      include: {
        requester: true,
        assignee: true,
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

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-3xl flex-col gap-6 py-16 px-6">
        <Link href="/" className="text-sm text-zinc-500 underline dark:text-zinc-400">
          ← Back to all incidents
        </Link>

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
              was raised (see calculateSlaDueDates in src/types/itil.ts). Once
              a ticket is resolved/closed, the "time left" framing stops
              mattering — what matters from then on is the permanent
              slaBreached flag set at the moment of resolution. */}
          <div className="mt-4 flex flex-col gap-2 rounded-md border border-black/10 p-3 text-sm dark:border-white/10">
            <div className="flex items-center justify-between">
              <span className="text-zinc-500">First response SLA</span>
              {isOpen ? (
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
                <Badge tone={incident.slaBreached ? "danger" : "success"}>
                  {incident.slaBreached ? "Breached" : "Met SLA"}
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
