import { prisma } from "@/src/lib/prisma";
import { getActiveUser } from "@/src/lib/session";
import { ROLE_LABELS } from "@/src/types/itil";
import { Role } from "@/app/generated/prisma/client";
import { IncidentGroup, PageHeader, isOpenStatus, isOverdue, isAtRisk } from "@/src/components/incident-list";

// Without this, Next.js sees no dynamic input (no cookies, no searchParams)
// on this page and assumes it's safe to pre-render once at build time and
// serve that same HTML to everyone — which would freeze the ticket list at
// whatever it looked like when we last ran `next build`. A live dashboard
// must be re-rendered on every request instead.
export const dynamic = "force-dynamic";

const OPEN_STATUSES = ["NEW", "IN_PROGRESS", "ON_HOLD"] as const;

// This component has no "use client" directive, which makes it a React
// Server Component — it runs only on the server, never ships its code to
// the browser, and is allowed to talk directly to the database like this.
// There is no API route, no fetch(), no client-side loading spinner: the
// HTML that reaches the browser already has the data baked in. This is
// the biggest structural difference from older React apps, where every
// page load meant "render an empty shell, then fetch."
//
// What renders below is different per role — the same idea as a real
// service desk tool, where a customer sees "my tickets", an L1 agent sees
// their queue, and a manager sees everything. This is what turns
// `currentTier` (see prisma/schema.prisma) from a database column into
// something that actually shapes the UI: it's the WHERE clause that keeps
// an L2 agent from seeing L1's unclaimed tickets.
//
// This is the personal "my work" dashboard. For browsing/searching every
// ticket visible to you regardless of assignment, see /incidents.
export default async function Home() {
  const activeUser = await getActiveUser();

  if (!activeUser) {
    const incidents = await prisma.incident.findMany({
      orderBy: { createdAt: "desc" },
      include: { assignee: true, requester: true },
    });
    return (
      <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
        <main className="flex w-full max-w-3xl flex-col gap-6 py-16 px-6">
          <PageHeader
            title="ITIL Service Desk"
            subtitle="Pick a user from &quot;Viewing as&quot; above to see a role-specific view. Showing every ticket in the meantime."
          />
          <IncidentGroup
            title="All incidents"
            emptyMessage="No incidents logged yet."
            incidents={incidents}
          />
        </main>
      </div>
    );
  }

  if (activeUser.role === Role.CUSTOMER) {
    const myIncidents = await prisma.incident.findMany({
      where: { requesterId: activeUser.id },
      orderBy: { createdAt: "desc" },
      include: { assignee: true, requester: true },
    });
    return (
      <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
        <main className="flex w-full max-w-3xl flex-col gap-6 py-16 px-6">
          <PageHeader title="ITIL Service Desk" subtitle={`Tickets you've reported, ${activeUser.name}.`} />
          <IncidentGroup
            title="Open"
            emptyMessage="Nothing open right now."
            incidents={myIncidents.filter((i) => isOpenStatus(i.status))}
          />
          <IncidentGroup
            title="Resolved & closed"
            emptyMessage="No resolved or closed tickets yet."
            incidents={myIncidents.filter((i) => !isOpenStatus(i.status))}
          />
        </main>
      </div>
    );
  }

  if (activeUser.role === Role.MANAGER) {
    const incidents = await prisma.incident.findMany({
      orderBy: { createdAt: "desc" },
      include: { assignee: true, requester: true },
    });
    // Breached first (already overdue, most urgent), then at-risk sorted
    // by soonest deadline — this is a triage list, not a creation-order
    // list, so the ticket about to blow its SLA belongs at the top.
    const slaAtRisk = incidents
      .filter((i) => isOverdue(i) || isAtRisk(i))
      .sort((a, b) => {
        if (isOverdue(a) !== isOverdue(b)) return isOverdue(a) ? -1 : 1;
        return a.slaResolveDueAt.getTime() - b.slaResolveDueAt.getTime();
      });
    return (
      <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
        <main className="flex w-full max-w-3xl flex-col gap-6 py-16 px-6">
          <PageHeader title="ITIL Service Desk" subtitle="Full visibility across every support tier." />
          <IncidentGroup
            title="⚠ SLA at risk"
            emptyMessage="Nothing breached or close to breaching its SLA right now."
            incidents={slaAtRisk}
          />
          <IncidentGroup
            title="Open incidents"
            emptyMessage="Nothing open — every ticket is resolved or closed."
            incidents={incidents.filter((i) => isOpenStatus(i.status))}
          />
          <IncidentGroup
            title="Resolved & closed"
            emptyMessage="Nothing resolved or closed yet."
            incidents={incidents.filter((i) => !isOpenStatus(i.status))}
          />
        </main>
      </div>
    );
  }

  // Remaining case: an L1/L2/L3 agent. Their dashboard is split into two
  // queues — tickets already claimed by them, and unclaimed tickets
  // sitting in their tier's queue, waiting to be taken.
  const [myTickets, queueTickets] = await Promise.all([
    prisma.incident.findMany({
      where: { assigneeId: activeUser.id, status: { in: [...OPEN_STATUSES] } },
      orderBy: { createdAt: "desc" },
      include: { assignee: true, requester: true },
    }),
    prisma.incident.findMany({
      where: { assigneeId: null, currentTier: activeUser.role, status: "NEW" },
      orderBy: { createdAt: "asc" },
      include: { assignee: true, requester: true },
    }),
  ]);

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-3xl flex-col gap-8 py-16 px-6">
        <PageHeader
          title="ITIL Service Desk"
          subtitle={`Working as ${ROLE_LABELS[activeUser.role]} — ${activeUser.name}.`}
        />
        <IncidentGroup
          title="My tickets"
          emptyMessage="Nothing assigned to you right now."
          incidents={myTickets}
        />
        <IncidentGroup
          title={`${ROLE_LABELS[activeUser.role]} queue`}
          emptyMessage="No unclaimed tickets waiting in this tier."
          incidents={queueTickets}
        />
      </main>
    </div>
  );
}
