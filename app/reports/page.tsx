import { redirect } from "next/navigation";
import { prisma } from "@/src/lib/prisma";
import { getActiveUser } from "@/src/lib/session";
import { getDemoSessionId, demoSessionFilter } from "@/src/lib/demo-session";
import { CATEGORY_LABELS, PRIORITY_LABELS, SUPPORT_TIERS } from "@/src/types/itil";
import { Role, IncidentCategory, Priority } from "@/app/generated/prisma/client";
import { BarRow, ReportCard, StatBlock } from "@/src/components/bar-chart";

export const dynamic = "force-dynamic";

// Short form of ROLE_LABELS, "L2 Agent, Technical Support" doesn't fit
// this chart's fixed label column, and the full title isn't needed here
// anyway, only the tier itself is.
const TIER_SHORT_LABELS: Record<Role, string> = {
  CUSTOMER: "Customer",
  AGENT_L1: "L1 Agent",
  AGENT_L2: "L2 Agent",
  AGENT_L3: "L3 Agent",
  MANAGER: "Manager",
};

// A manager's actual day-to-day includes very little hands-on ticket
// work (see the home dashboard's manager explainer: "managers don't
// usually work tickets hands-on"). This is the other half of the job
// this simulation was missing entirely: watching how the desk is
// performing as a whole and reporting on it, not one ticket at a time.
// Manager-only, same reasoning as every close-out/approval action
// already reserved for the role, this is a leadership view, not a
// working-agent one.
export default async function ReportsPage() {
  const activeUser = await getActiveUser();
  if (!activeUser) {
    redirect("/login");
  }
  if (activeUser.role !== Role.MANAGER) {
    redirect("/");
  }

  const demoSessionId = await getDemoSessionId();
  const filter = demoSessionFilter(demoSessionId);

  const [incidents, incidentEscalations, problems, changes, serviceRequests] = await Promise.all([
    prisma.incident.findMany({ where: filter }),
    // Distinct incident ids that were escalated at least once, an
    // escalation rate needs "how many tickets", not "how many
    // escalation events" (one ticket can be escalated more than once).
    prisma.incidentActivity.findMany({
      where: { type: "ESCALATED", incident: filter },
      select: { incidentId: true },
      distinct: ["incidentId"],
    }),
    prisma.problem.findMany({ where: filter, select: { status: true, ownerId: true } }),
    prisma.change.findMany({ where: filter, select: { status: true } }),
    prisma.serviceRequest.findMany({
      where: filter,
      select: { status: true, createdAt: true, fulfilledAt: true },
    }),
  ]);

  const totalIncidents = incidents.length;
  const openIncidents = incidents.filter(
    (i) => i.status === "NEW" || i.status === "IN_PROGRESS" || i.status === "ON_HOLD",
  );
  const everResolved = incidents.filter((i) => i.resolvedAt !== null);

  const slaMet = everResolved.filter((i) => !i.slaResolveBreached).length;
  const slaBreached = everResolved.length - slaMet;
  const overallComplianceRate = everResolved.length > 0 ? (slaMet / everResolved.length) * 100 : null;

  const priorityOrder = Object.values(Priority);
  const complianceByPriority = priorityOrder.map((priority) => {
    const resolvedForPriority = everResolved.filter((i) => i.priority === priority);
    const met = resolvedForPriority.filter((i) => !i.slaResolveBreached).length;
    const rate = resolvedForPriority.length > 0 ? (met / resolvedForPriority.length) * 100 : null;
    return { priority, rate, sampleSize: resolvedForPriority.length };
  });

  const avgResolutionHoursByPriority = priorityOrder.map((priority) => {
    const resolvedForPriority = everResolved.filter((i) => i.priority === priority);
    if (resolvedForPriority.length === 0) {
      return { priority, hours: null };
    }
    const totalMs = resolvedForPriority.reduce(
      (sum, i) => sum + (i.resolvedAt!.getTime() - i.createdAt.getTime()),
      0,
    );
    return { priority, hours: totalMs / resolvedForPriority.length / (60 * 60 * 1000) };
  });

  const categoryOrder = Object.values(IncidentCategory);
  const volumeByCategory = categoryOrder.map((category) => ({
    category,
    count: incidents.filter((i) => i.category === category).length,
  }));
  const maxCategoryVolume = Math.max(1, ...volumeByCategory.map((c) => c.count));

  const backlogByTier = SUPPORT_TIERS.map((tier) => ({
    tier,
    count: openIncidents.filter((i) => i.assigneeId === null && i.currentTier === tier).length,
  }));
  const maxBacklog = Math.max(1, ...backlogByTier.map((t) => t.count));

  const escalatedIncidentCount = incidentEscalations.length;
  const escalationRate = totalIncidents > 0 ? (escalatedIncidentCount / totalIncidents) * 100 : null;

  // Other processes, a lighter summary row rather than a full report
  // each, since Incident is the volume driver this page is built around.
  const knownErrorCount = problems.filter((p) => p.status === "KNOWN_ERROR").length;
  const unownedProblemCount = problems.filter((p) => p.ownerId === null && p.status !== "CLOSED").length;

  const completedChanges = changes.filter((c) => c.status === "COMPLETED").length;
  const failedChanges = changes.filter((c) => c.status === "FAILED").length;
  const changeSuccessRate =
    completedChanges + failedChanges > 0
      ? (completedChanges / (completedChanges + failedChanges)) * 100
      : null;

  const pendingApprovalRequests = serviceRequests.filter((r) => r.status === "PENDING_APPROVAL").length;
  const fulfilledRequests = serviceRequests.filter((r) => r.fulfilledAt !== null);
  const avgFulfillmentHours =
    fulfilledRequests.length > 0
      ? fulfilledRequests.reduce(
          (sum, r) => sum + (r.fulfilledAt!.getTime() - r.createdAt.getTime()),
          0,
        ) /
        fulfilledRequests.length /
        (60 * 60 * 1000)
      : null;

  function formatPct(value: number | null): string {
    return value === null ? "n/a" : `${Math.round(value)}%`;
  }
  function formatHours(value: number | null): string {
    if (value === null) return "n/a";
    return value < 1 ? `${Math.round(value * 60)}m` : `${value.toFixed(1)}h`;
  }
  function complianceTone(rate: number | null): "neutral" | "danger" | "success" | "warning" {
    if (rate === null) return "neutral";
    if (rate >= 90) return "success";
    if (rate >= 75) return "warning";
    return "danger";
  }

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-3xl flex-col gap-6 py-16 px-6">
        <div>
          <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">📊 Reports</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            How the desk is actually performing, not one ticket at a time.
          </p>
        </div>

        <p className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300">
          This is the part of the manager role that isn&apos;t hands-on
          ticket work: watching SLA compliance, spotting where the
          backlog is piling up, and reporting on how the team is doing
          overall. Every number below is computed live from the same
          Incident, Problem, Change, and Service Request data everywhere
          else in the app, this isn&apos;t separate mock data.
        </p>

        <ReportCard title="SLA performance">
          <div className="flex flex-wrap gap-3">
            <StatBlock
              label="Overall compliance"
              value={formatPct(overallComplianceRate)}
              tone={complianceTone(overallComplianceRate)}
            />
            <StatBlock
              label="Met SLA"
              value={`${slaMet} of ${everResolved.length}`}
            />
            <StatBlock label="Breached" value={String(slaBreached)} tone={slaBreached > 0 ? "danger" : "neutral"} />
            <StatBlock
              label="Escalation rate"
              value={formatPct(escalationRate)}
            />
          </div>

          <div className="mt-2 flex flex-col gap-2">
            <p className="text-xs font-medium text-zinc-500">Compliance by priority</p>
            {complianceByPriority.map(({ priority, rate, sampleSize }) => (
              <BarRow
                key={priority}
                label={PRIORITY_LABELS[priority]}
                value={rate ?? 0}
                max={100}
                displayValue={sampleSize > 0 ? formatPct(rate) : "no data"}
                tone={complianceTone(rate)}
              />
            ))}
          </div>

          <div className="mt-2 flex flex-col gap-2">
            <p className="text-xs font-medium text-zinc-500">Average resolution time by priority</p>
            {avgResolutionHoursByPriority.map(({ priority, hours }) => (
              <div key={priority} className="flex items-center justify-between text-sm">
                <span className="text-zinc-600 dark:text-zinc-400">{PRIORITY_LABELS[priority]}</span>
                <span className="font-medium text-black dark:text-zinc-50">{formatHours(hours)}</span>
              </div>
            ))}
          </div>
        </ReportCard>

        <ReportCard title="Ticket volume by category">
          {volumeByCategory.map(({ category, count }) => (
            <BarRow
              key={category}
              label={CATEGORY_LABELS[category]}
              value={count}
              max={maxCategoryVolume}
            />
          ))}
        </ReportCard>

        <ReportCard title="Current backlog, unclaimed by tier">
          {backlogByTier.map(({ tier, count }) => (
            <BarRow
              key={tier}
              label={TIER_SHORT_LABELS[tier]}
              value={count}
              max={maxBacklog}
              tone={count > 0 ? "warning" : "neutral"}
            />
          ))}
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {openIncidents.length} incident{openIncidents.length === 1 ? "" : "s"} open in total,{" "}
            {openIncidents.length - backlogByTier.reduce((sum, t) => sum + t.count, 0)} already claimed by
            an agent.
          </p>
        </ReportCard>

        <ReportCard title="Across the other processes">
          <div className="flex flex-wrap gap-3">
            <StatBlock label="Known Errors active" value={String(knownErrorCount)} tone={knownErrorCount > 0 ? "warning" : "neutral"} />
            <StatBlock label="Problems unowned" value={String(unownedProblemCount)} tone={unownedProblemCount > 0 ? "warning" : "neutral"} />
            <StatBlock
              label="Change success rate"
              value={formatPct(changeSuccessRate)}
              tone={complianceTone(changeSuccessRate)}
            />
            <StatBlock
              label="Requests awaiting approval"
              value={String(pendingApprovalRequests)}
              tone={pendingApprovalRequests > 0 ? "warning" : "neutral"}
            />
            <StatBlock label="Avg. request fulfillment" value={formatHours(avgFulfillmentHours)} />
          </div>
        </ReportCard>
      </main>
    </div>
  );
}
