import { prisma } from "@/src/lib/prisma";
import { getActiveUser } from "@/src/lib/session";
import { CATEGORY_LABELS, PRIORITY_LABELS } from "@/src/types/itil";
import { Role, IncidentCategory, Priority, IncidentStatus } from "@/app/generated/prisma/client";
import type { Prisma } from "@/app/generated/prisma/client";
import { IncidentGroup, PageHeader } from "@/src/components/incident-list";

export const dynamic = "force-dynamic";

const STATUS_OPTIONS = Object.values(IncidentStatus);
const PRIORITY_OPTIONS = Object.values(Priority);
const CATEGORY_OPTIONS = Object.values(IncidentCategory);

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

// Browse/search every incident the current role is allowed to see —
// unlike the home page (your personal "my work" dashboard), this page
// answers "does a ticket matching X exist at all", which a service desk
// tool needs just as much as a personalized queue.
export default async function SearchIncidentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const q = firstValue(params.q)?.trim() ?? "";
  const statusFilter = firstValue(params.status) ?? "";
  const priorityFilter = firstValue(params.priority) ?? "";
  const categoryFilter = firstValue(params.category) ?? "";

  const activeUser = await getActiveUser();

  // Same visibility rule as the home page dashboard, just expressed as a
  // Prisma WHERE clause instead of separate queries: a customer only ever
  // sees their own reports, an agent sees what they've claimed plus their
  // tier's queue, a manager sees everything, and nobody logged in sees
  // everything too (there's no real auth in v1 — see docs/BUILD_LOG.md).
  let visibilityWhere: Prisma.IncidentWhereInput = {};
  if (activeUser?.role === Role.CUSTOMER) {
    visibilityWhere = { requesterId: activeUser.id };
  } else if (activeUser && activeUser.role !== Role.MANAGER) {
    visibilityWhere = {
      OR: [
        { assigneeId: activeUser.id },
        { assigneeId: null, currentTier: activeUser.role },
      ],
    };
  }

  const filters: Prisma.IncidentWhereInput[] = [visibilityWhere];
  if (q.length > 0) {
    // `mode: "insensitive"` matters here specifically because this ran on
    // SQLite during earlier development, where `contains` compiles to a
    // LIKE that's case-insensitive for ASCII by default — this looked
    // like it "just worked" without the mode. PostgreSQL's LIKE is
    // case-sensitive by default, so switching databases silently broke
    // "DRIVE" from matching "drive" until this was added explicitly.
    filters.push({
      OR: [
        { ticketNumber: { contains: q, mode: "insensitive" } },
        { title: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
      ],
    });
  }
  if (STATUS_OPTIONS.includes(statusFilter as IncidentStatus)) {
    filters.push({ status: statusFilter as IncidentStatus });
  }
  if (PRIORITY_OPTIONS.includes(priorityFilter as Priority)) {
    filters.push({ priority: priorityFilter as Priority });
  }
  if (CATEGORY_OPTIONS.includes(categoryFilter as IncidentCategory)) {
    filters.push({ category: categoryFilter as IncidentCategory });
  }

  const incidents = await prisma.incident.findMany({
    where: { AND: filters },
    orderBy: { createdAt: "desc" },
    include: { assignee: true, requester: true },
  });

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-3xl flex-col gap-6 py-16 px-6">
        <PageHeader
          title="Search Incidents"
          subtitle="Search and filter every ticket visible to your role."
        />

        {/* Plain GET form — filtering happens by reloading the page with
            query-string parameters (?q=...&status=...), which this Server
            Component reads directly. No client-side JavaScript, no
            onChange handlers: submitting the form IS the navigation. */}
        <form className="flex flex-wrap gap-2 rounded-lg border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Search title, description, or ticket number…"
            className="min-w-[200px] flex-1 rounded border border-black/10 bg-white px-3 py-1.5 text-sm dark:border-white/10 dark:bg-zinc-900"
          />
          <select
            name="status"
            defaultValue={statusFilter}
            className="rounded border border-black/10 bg-white px-3 py-1.5 text-sm dark:border-white/10 dark:bg-zinc-900"
          >
            <option value="">Any status</option>
            {STATUS_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {value.replace("_", " ")}
              </option>
            ))}
          </select>
          <select
            name="priority"
            defaultValue={priorityFilter}
            className="rounded border border-black/10 bg-white px-3 py-1.5 text-sm dark:border-white/10 dark:bg-zinc-900"
          >
            <option value="">Any priority</option>
            {PRIORITY_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {PRIORITY_LABELS[value]}
              </option>
            ))}
          </select>
          <select
            name="category"
            defaultValue={categoryFilter}
            className="rounded border border-black/10 bg-white px-3 py-1.5 text-sm dark:border-white/10 dark:bg-zinc-900"
          >
            <option value="">Any category</option>
            {CATEGORY_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {CATEGORY_LABELS[value]}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-full bg-foreground px-4 py-1.5 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
          >
            Search
          </button>
          {(q || statusFilter || priorityFilter || categoryFilter) && (
            <a
              href="/incidents"
              className="rounded-full border border-black/10 px-4 py-1.5 text-sm font-medium dark:border-white/10"
            >
              Clear
            </a>
          )}
        </form>

        <IncidentGroup
          title="Results"
          emptyMessage="No incidents match these filters."
          incidents={incidents}
        />
      </main>
    </div>
  );
}
