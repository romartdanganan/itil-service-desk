import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/src/lib/prisma";
import { getActiveUser } from "@/src/lib/session";
import { getDemoSessionId, demoSessionFilter } from "@/src/lib/demo-session";
import { CATEGORY_LABELS, ROLE_LABELS, isAgentRole } from "@/src/types/itil";
import { Role } from "@/app/generated/prisma/client";
import {
  approveServiceRequest,
  rejectServiceRequest,
  takeServiceRequest,
  reassignServiceRequest,
  fulfillServiceRequest,
  closeServiceRequest,
  cancelServiceRequest,
  addServiceRequestComment,
} from "@/src/actions/service-request-workflow";

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

export default async function ServiceRequestDetailPage({
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

  const demoSessionId = await getDemoSessionId();

  const [serviceRequest, agents] = await Promise.all([
    // findFirst, not findUnique, same reason as the incident detail page:
    // lets the demo-session check ride alongside `id` in one query.
    prisma.serviceRequest.findFirst({
      where: { id, ...demoSessionFilter(demoSessionId) },
      include: {
        requester: true,
        fulfiller: true,
        approvedBy: true,
        activities: { include: { actor: true }, orderBy: { createdAt: "asc" } },
      },
    }),
    prisma.user.findMany({
      where: { role: { in: [Role.AGENT_L1, Role.AGENT_L2, Role.AGENT_L3] } },
      orderBy: { name: "asc" },
    }),
  ]);

  if (!serviceRequest) {
    notFound();
  }
  // A customer can only ever see their own requests, same visibility rule
  // as Incident: this is customer-facing data, unlike Problem/Change.
  if (activeUser.role === Role.CUSTOMER && serviceRequest.requesterId !== activeUser.id) {
    notFound();
  }

  const canWork = isAgentRole(activeUser.role);
  const canManage = activeUser.role === Role.MANAGER;
  const isRequester = activeUser.id === serviceRequest.requesterId;
  const canTake =
    canWork &&
    serviceRequest.fulfillerId !== activeUser.id &&
    (serviceRequest.status === "SUBMITTED" || serviceRequest.status === "APPROVED");
  const canFulfill = canWork && serviceRequest.status === "IN_PROGRESS";
  const canClose = (isRequester || canManage) && serviceRequest.status === "FULFILLED";
  const canCancel =
    (isRequester || canManage) &&
    ["SUBMITTED", "PENDING_APPROVAL", "APPROVED", "IN_PROGRESS"].includes(serviceRequest.status);

  const statusTone: "neutral" | "warning" | "danger" | "success" =
    serviceRequest.status === "FULFILLED" || serviceRequest.status === "CLOSED"
      ? "success"
      : serviceRequest.status === "REJECTED" || serviceRequest.status === "CANCELLED"
        ? "danger"
        : serviceRequest.status === "PENDING_APPROVAL"
          ? "warning"
          : "neutral";

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-3xl flex-col gap-6 py-16 px-6">
        <Link href="/requests" className="text-sm text-zinc-500 underline dark:text-zinc-400">
          ← Back to all requests
        </Link>

        {created && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm dark:border-emerald-900 dark:bg-emerald-950/40">
            <p className="font-semibold text-emerald-900 dark:text-emerald-300">
              ✓ Submitted as {serviceRequest.requestNumber}
            </p>
            <p className="mt-1 text-emerald-800 dark:text-emerald-400">
              {serviceRequest.requestType === "STANDARD"
                ? "This is pre-approved and already in the fulfillment queue, an agent hasn't picked it up yet."
                : "This needs a manager's sign-off before anyone can start on it."}{" "}
              Bookmark this page, or find it again later under &quot;Requests&quot;.
            </p>
          </div>
        )}

        <div className="rounded-lg border border-black/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-medium text-zinc-500">{serviceRequest.requestNumber}</span>
            <div className="flex gap-2">
              <Badge>{serviceRequest.requestType === "STANDARD" ? "Pre-approved" : "Needs approval"}</Badge>
              <Badge tone={statusTone}>{serviceRequest.status.replace("_", " ")}</Badge>
            </div>
          </div>

          <h1 className="mt-2 text-xl font-semibold text-black dark:text-zinc-50">
            {serviceRequest.title}
          </h1>
          <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">
            {serviceRequest.description}
          </p>

          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-zinc-500">Category</dt>
              <dd className="text-black dark:text-zinc-50">{CATEGORY_LABELS[serviceRequest.category]}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Requested by</dt>
              <dd className="text-black dark:text-zinc-50">{serviceRequest.requester.name}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">Fulfiller</dt>
              <dd className="text-black dark:text-zinc-50">
                {serviceRequest.fulfiller
                  ? `${serviceRequest.fulfiller.name} (${ROLE_LABELS[serviceRequest.fulfiller.role]})`
                  : "Unassigned"}
              </dd>
            </div>
          </dl>

          {serviceRequest.approvalNotes && (
            <div className="mt-4 rounded-md bg-amber-50 p-3 text-sm dark:bg-amber-950/40">
              <p className="font-medium text-amber-900 dark:text-amber-300">
                {serviceRequest.status === "REJECTED" ? "Rejection reason" : "Approval notes"}
              </p>
              <p className="mt-1 text-amber-800 dark:text-amber-400">{serviceRequest.approvalNotes}</p>
            </div>
          )}

          {serviceRequest.fulfillmentNotes && (
            <div className="mt-4 rounded-md bg-emerald-50 p-3 text-sm dark:bg-emerald-950/40">
              <p className="font-medium text-emerald-900 dark:text-emerald-300">Fulfillment notes</p>
              <p className="mt-1 text-emerald-800 dark:text-emerald-400">
                {serviceRequest.fulfillmentNotes}
              </p>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4">
          {canManage && serviceRequest.status === "PENDING_APPROVAL" && (
            <div className="rounded-lg border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
              <h2 className="text-sm font-semibold text-black dark:text-zinc-50">Approve or reject</h2>
              <p className="mt-1 text-xs text-zinc-500">
                This request isn&apos;t part of the pre-approved catalog, decide whether it goes ahead.
              </p>
              <form action={approveServiceRequest} className="mt-3 flex flex-col gap-2">
                <input type="hidden" name="requestId" value={serviceRequest.id} />
                <input
                  name="approvalNotes"
                  type="text"
                  placeholder="Approval notes (optional)"
                  className="rounded border border-black/10 bg-white px-3 py-1.5 text-xs dark:border-white/10 dark:bg-zinc-900"
                />
                <button className="self-start rounded-full bg-foreground px-4 py-1.5 text-xs font-medium text-background">
                  Approve
                </button>
              </form>
              <form action={rejectServiceRequest} className="mt-3 flex flex-col gap-2">
                <input type="hidden" name="requestId" value={serviceRequest.id} />
                <input
                  name="approvalNotes"
                  type="text"
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

          {(canTake || canFulfill) && (
            <div className="rounded-lg border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
              <h2 className="text-sm font-semibold text-black dark:text-zinc-50">Fulfill this request</h2>
              {canTake && (
                <form action={takeServiceRequest} className="mt-3">
                  <input type="hidden" name="requestId" value={serviceRequest.id} />
                  <button className="rounded-full bg-foreground px-4 py-1.5 text-xs font-medium text-background">
                    Take request
                  </button>
                </form>
              )}
              {canFulfill && (
                <form action={fulfillServiceRequest} className="mt-3 flex flex-col gap-2">
                  <input type="hidden" name="requestId" value={serviceRequest.id} />
                  <label className="text-xs font-medium text-zinc-500">Mark fulfilled</label>
                  <textarea
                    name="fulfillmentNotes"
                    required
                    rows={2}
                    placeholder="What did you do to fulfill this?"
                    className="rounded border border-black/10 bg-white px-3 py-1.5 text-xs dark:border-white/10 dark:bg-zinc-900"
                  />
                  <button className="self-start rounded-full bg-foreground px-4 py-1.5 text-xs font-medium text-background">
                    Mark fulfilled
                  </button>
                </form>
              )}
            </div>
          )}

          {canManage &&
            agents.length > 0 &&
            ["SUBMITTED", "APPROVED", "IN_PROGRESS"].includes(serviceRequest.status) && (
              <div className="rounded-lg border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
                <h2 className="text-sm font-semibold text-black dark:text-zinc-50">Reassign</h2>
                <form action={reassignServiceRequest} className="mt-3 flex gap-2">
                  <input type="hidden" name="requestId" value={serviceRequest.id} />
                  <select
                    name="fulfillerId"
                    required
                    defaultValue=""
                    className="flex-1 rounded border border-black/10 bg-white px-3 py-1.5 text-xs dark:border-white/10 dark:bg-zinc-900"
                  >
                    <option value="" disabled>
                      Choose an agent…
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

          {canClose && (
            <div className="rounded-lg border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
              <h2 className="text-sm font-semibold text-black dark:text-zinc-50">Confirm and close</h2>
              <p className="mt-1 text-xs text-zinc-500">
                Closing confirms this actually got you what you needed.
              </p>
              <form action={closeServiceRequest} className="mt-3">
                <input type="hidden" name="requestId" value={serviceRequest.id} />
                <button className="rounded-full bg-foreground px-4 py-1.5 text-xs font-medium text-background">
                  Close request
                </button>
              </form>
            </div>
          )}

          {canCancel && (
            <div className="rounded-lg border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
              <h2 className="text-sm font-semibold text-black dark:text-zinc-50">Cancel this request</h2>
              <p className="mt-1 text-xs text-zinc-500">Changed your mind, or no longer needed.</p>
              <form action={cancelServiceRequest} className="mt-3">
                <input type="hidden" name="requestId" value={serviceRequest.id} />
                <button className="rounded-full border border-black/10 px-4 py-1.5 text-xs font-medium dark:border-white/10">
                  Cancel request
                </button>
              </form>
            </div>
          )}

          <div className="rounded-lg border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
            <h2 className="text-sm font-semibold text-black dark:text-zinc-50">Add a comment</h2>
            <form action={addServiceRequestComment} className="mt-3 flex flex-col gap-2">
              <input type="hidden" name="requestId" value={serviceRequest.id} />
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

        <div>
          <h2 className="text-sm font-semibold text-black dark:text-zinc-50">Activity</h2>
          <ol className="mt-3 flex flex-col gap-3">
            {serviceRequest.activities.map((activity) => (
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
