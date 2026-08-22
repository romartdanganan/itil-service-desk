import { prisma } from "@/src/lib/prisma";
import { PRIORITY_LABELS } from "@/src/types/itil";

// Without this, Next.js sees no dynamic input (no cookies, no searchParams)
// on this page and assumes it's safe to pre-render once at build time and
// serve that same HTML to everyone — which would freeze the ticket list at
// whatever it looked like when we last ran `next build`. A live dashboard
// must be re-rendered on every request instead.
export const dynamic = "force-dynamic";

// This component has no "use client" directive, which makes it a React
// Server Component — it runs only on the server, never ships its code to
// the browser, and is allowed to talk directly to the database like this.
// There is no API route, no fetch(), no client-side loading spinner: the
// HTML that reaches the browser already has the data baked in. This is
// the biggest structural difference from older React apps, where every
// page load meant "render an empty shell, then fetch."
export default async function Home() {
  const incidents = await prisma.incident.findMany({
    orderBy: { createdAt: "asc" },
    include: { assignee: true },
  });

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-3xl flex-col gap-6 py-16 px-6">
        <div>
          <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
            ITIL Service Desk — Incidents
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {incidents.length} incident{incidents.length === 1 ? "" : "s"} in
            the database, loaded via Prisma + SQLite.
          </p>
        </div>

        <ul className="flex flex-col gap-3">
          {incidents.map((incident) => (
            <li
              key={incident.id}
              className="rounded-lg border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900"
            >
              <div className="flex items-center justify-between text-xs font-medium text-zinc-500">
                <span>{incident.ticketNumber}</span>
                <span>{PRIORITY_LABELS[incident.priority]}</span>
              </div>
              <p className="mt-1 font-medium text-black dark:text-zinc-50">
                {incident.title}
              </p>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                Status: {incident.status} · Assigned to{" "}
                {incident.assignee?.name ?? "Unassigned"}
              </p>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
