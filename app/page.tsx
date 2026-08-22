import Link from "next/link";
import { prisma } from "@/src/lib/prisma";
import { getActiveUser } from "@/src/lib/session";
import { PRIORITY_LABELS, ROLE_LABELS } from "@/src/types/itil";
import { Role } from "@/app/generated/prisma/client";
import type { Incident, User } from "@/app/generated/prisma/client";

// Without this, Next.js sees no dynamic input (no cookies, no searchParams)
// on this page and assumes it's safe to pre-render once at build time and
// serve that same HTML to everyone — which would freeze the ticket list at
// whatever it looked like when we last ran `next build`. A live dashboard
// must be re-rendered on every request instead.
export const dynamic = "force-dynamic";

type IncidentRow = Incident & { assignee: User | null; requester: User };

const OPEN_STATUSES = ["NEW", "IN_PROGRESS", "ON_HOLD"] as const;

function isOverdue(incident: Incident): boolean {
  const isOpen = incident.status !== "RESOLVED" && incident.status !== "CLOSED";
  return isOpen && new Date() > incident.slaResolveDueAt;
}

function IncidentListItem({ incident }: { incident: IncidentRow }) {
  return (
    <li>
      <Link
        href={`/incidents/${incident.id}`}
        className="block rounded-lg border border-black/10 bg-white p-4 transition-colors hover:border-black/20 dark:border-white/10 dark:bg-zinc-900 dark:hover:border-white/20"
      >
        <div className="flex items-center justify-between text-xs font-medium text-zinc-500">
          <span>{incident.ticketNumber}</span>
          <div className="flex gap-2">
            {isOverdue(incident) && (
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-800 dark:bg-red-950 dark:text-red-300">
                SLA overdue
              </span>
            )}
            <span>{PRIORITY_LABELS[incident.priority]}</span>
          </div>
        </div>
        <p className="mt-1 font-medium text-black dark:text-zinc-50">{incident.title}</p>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Status: {incident.status.replace("_", " ")} · Reported by{" "}
          {incident.requester.name} · Assigned to{" "}
          {incident.assignee?.name ?? "Unassigned"}
        </p>
      </Link>
    </li>
  );
}

function IncidentGroup({
  title,
  emptyMessage,
  incidents,
}: {
  title: string;
  emptyMessage: string;
  incidents: IncidentRow[];
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-black dark:text-zinc-50">
        {title} ({incidents.length})
      </h2>
      {incidents.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{emptyMessage}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {incidents.map((incident) => (
            <IncidentListItem key={incident.id} incident={incident} />
          ))}
        </ul>
      )}
    </section>
  );
}

function PageHeader({ subtitle }: { subtitle: string }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
          ITIL Service Desk
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{subtitle}</p>
      </div>
      <Link
        href="/incidents/new"
        className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
      >
        Log New Incident
      </Link>
    </div>
  );
}

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
          <PageHeader subtitle="Pick a user from &quot;Viewing as&quot; above to see a role-specific view. Showing every ticket in the meantime." />
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
          <PageHeader subtitle={`Tickets you've reported, ${activeUser.name}.`} />
          <IncidentGroup
            title="My incidents"
            emptyMessage="You haven't reported any incidents yet."
            incidents={myIncidents}
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
    return (
      <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
        <main className="flex w-full max-w-3xl flex-col gap-6 py-16 px-6">
          <PageHeader subtitle="Full visibility across every support tier." />
          <IncidentGroup
            title="All incidents"
            emptyMessage="No incidents logged yet."
            incidents={incidents}
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
        <PageHeader subtitle={`Working as ${ROLE_LABELS[activeUser.role]} — ${activeUser.name}.`} />
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
