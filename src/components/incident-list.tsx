import Link from "next/link";
import { PRIORITY_LABELS } from "@/src/types/itil";
import type { Incident, User } from "@/app/generated/prisma/client";

// Shared between the role-scoped dashboard (app/page.tsx) and the
// search/browse page (app/incidents/page.tsx) so both render tickets the
// same way instead of drifting into two slightly different list styles.
// None of this needs "use client" — these are just functions that return
// JSX, rendered entirely on the server like everything else in this app.

export type IncidentRow = Incident & { assignee: User | null; requester: User };

export function isOpenStatus(status: Incident["status"]): boolean {
  return status !== "RESOLVED" && status !== "CLOSED";
}

export function isOverdue(incident: Incident): boolean {
  return isOpenStatus(incident.status) && new Date() > incident.slaResolveDueAt;
}

export function IncidentListItem({ incident }: { incident: IncidentRow }) {
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

export function IncidentGroup({
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

export function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">{title}</h1>
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
