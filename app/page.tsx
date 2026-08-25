import { redirect } from "next/navigation";
import { prisma } from "@/src/lib/prisma";
import { getActiveUser } from "@/src/lib/session";
import { ROLE_LABELS } from "@/src/types/itil";
import { Role } from "@/app/generated/prisma/client";
import { IncidentGroup, PageHeader, isOpenStatus, isOverdue, isAtRisk } from "@/src/components/incident-list";
import { generateIncomingTickets } from "@/src/actions/generate-tickets";

// A short "what am I looking at, and what am I supposed to do" blurb per
// role — the dashboard used to assume this was already understood, which
// is exactly the kind of gap that makes a practice tool unusable for
// someone actually trying to learn what the job looks like. Plain
// language on purpose; no ITSM jargon without explaining it right here.
function RoleExplainer({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300">
      {children}
    </p>
  );
}

// A real support queue never runs dry — new problems show up constantly.
// This button is what keeps a practice queue from emptying out after a
// few sessions and starting to feel pointless. See
// src/actions/generate-tickets.ts and src/data/incident-templates.ts.
function GenerateTicketsButton() {
  return (
    <form action={generateIncomingTickets}>
      <button
        type="submit"
        className="rounded-full border border-black/10 px-4 py-1.5 text-sm font-medium dark:border-white/10"
      >
        🔄 Simulate new tickets arriving
      </button>
    </form>
  );
}

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

  // Real ticket data — nobody gets to browse this signed out, the same
  // way a real service desk portal isn't publicly readable. /login has
  // one-click demo sign-in, so this costs a visitor nothing but a click.
  if (!activeUser) {
    redirect("/login");
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
          <RoleExplainer>
            You&apos;re a <strong>customer</strong> in this simulation — think of
            yourself as any employee at a company reporting a tech problem
            to IT. Click <strong>&quot;Log New Incident&quot;</strong> above
            to report something broken. Then check back here (or your{" "}
            <strong>Inbox</strong>) to see IT work on it — get assigned, get
            escalated if it&apos;s tricky, and eventually get fixed.
          </RoleExplainer>
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
    // Every ticket already surfaced above, in the urgent triage list,
    // gets left out of the plain "open" list below it, otherwise a
    // ticket that's overdue shows up twice in a row on the same page,
    // once as the thing to act on first, then again a few rows down.
    const slaAtRiskIds = new Set(slaAtRisk.map((i) => i.id));
    return (
      <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
        <main className="flex w-full max-w-3xl flex-col gap-6 py-16 px-6">
          <PageHeader title="ITIL Service Desk" subtitle="Full visibility across every support tier." />
          <RoleExplainer>
            You&apos;re the <strong>manager</strong> — you can see every ticket
            across every tier (agents only see their own). Use this to
            watch for tickets at risk of missing their{" "}
            <strong>SLA</strong> (the deadline IT promised to respond/fix
            by), and reassign a ticket to a specific agent if the tier
            queue isn&apos;t moving. Managers don&apos;t usually work
            tickets hands-on — that&apos;s what the agent tiers below are
            for.
          </RoleExplainer>
          <GenerateTicketsButton />
          <IncidentGroup
            title="⚠ SLA at risk"
            emptyMessage="Nothing breached or close to breaching its SLA right now."
            incidents={slaAtRisk}
          />
          <IncidentGroup
            title="Open incidents"
            emptyMessage="Nothing open besides what's shown above."
            incidents={incidents.filter(
              (i) => isOpenStatus(i.status) && !slaAtRiskIds.has(i.id),
            )}
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
        <RoleExplainer>
          You&apos;re an IT support agent — this is your actual workload.{" "}
          <strong>&quot;My tickets&quot;</strong> is what you&apos;ve already
          claimed; the <strong>queue</strong> below is unclaimed work
          waiting for someone at your tier. Click a ticket to open it, then
          use the buttons there to take it, resolve it once it&apos;s
          fixed, or escalate it up a tier if it&apos;s beyond what you can
          do. Nothing to work on? Use the button below to simulate new
          tickets coming in.
        </RoleExplainer>
        <GenerateTicketsButton />
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
