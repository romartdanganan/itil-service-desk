import { redirect } from "next/navigation";
import { prisma } from "@/src/lib/prisma";
import { getActiveUser } from "@/src/lib/session";
import { CATEGORY_LABELS, isAgentRole } from "@/src/types/itil";
import { IncidentCategory, ChangeType, ChangeRisk, ChangeStatus } from "@/app/generated/prisma/client";
import type { Prisma } from "@/app/generated/prisma/client";
import { ChangeGroup, ChangePageHeader } from "@/src/components/change-list";

export const dynamic = "force-dynamic";

const STATUS_OPTIONS = Object.values(ChangeStatus);
const TYPE_OPTIONS = Object.values(ChangeType);
const RISK_OPTIONS = Object.values(ChangeRisk);

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

// Browse/search every Change, agent/manager only, never customer-facing,
// same visibility rule as /problems: no tier scoping, any agent or
// manager can see and work any Change.
export default async function ChangesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const q = firstValue(params.q)?.trim() ?? "";
  const statusFilter = firstValue(params.status) ?? "";
  const typeFilter = firstValue(params.type) ?? "";
  const riskFilter = firstValue(params.risk) ?? "";
  const categoryFilter = firstValue(params.category) ?? "";

  const activeUser = await getActiveUser();
  if (!activeUser) {
    redirect("/login");
  }
  if (!isAgentRole(activeUser.role)) {
    redirect("/");
  }

  const filters: Prisma.ChangeWhereInput[] = [];
  if (q.length > 0) {
    filters.push({
      OR: [
        { changeNumber: { contains: q, mode: "insensitive" } },
        { title: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
      ],
    });
  }
  if (STATUS_OPTIONS.includes(statusFilter as ChangeStatus)) {
    filters.push({ status: statusFilter as ChangeStatus });
  }
  if (TYPE_OPTIONS.includes(typeFilter as ChangeType)) {
    filters.push({ changeType: typeFilter as ChangeType });
  }
  if (RISK_OPTIONS.includes(riskFilter as ChangeRisk)) {
    filters.push({ risk: riskFilter as ChangeRisk });
  }
  if (Object.values(IncidentCategory).includes(categoryFilter as IncidentCategory)) {
    filters.push({ category: categoryFilter as IncidentCategory });
  }

  const [awaitingApproval, changes] = await Promise.all([
    prisma.change.findMany({
      where: {
        OR: [
          { status: "REQUESTED" },
          { status: "IN_PROGRESS", changeType: "EMERGENCY", approvedById: null },
        ],
      },
      orderBy: { createdAt: "asc" },
      include: { requestedBy: true },
    }),
    prisma.change.findMany({
      where: filters.length > 0 ? { AND: filters } : {},
      orderBy: { createdAt: "desc" },
      include: { requestedBy: true },
    }),
  ]);

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-3xl flex-col gap-6 py-16 px-6">
        <ChangePageHeader
          title="Change Management"
          subtitle="Request, approve, and track changes, agent and manager only."
        />

        <form className="flex flex-wrap gap-2 rounded-lg border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Search title, description, or change number..."
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
            name="type"
            defaultValue={typeFilter}
            className="rounded border border-black/10 bg-white px-3 py-1.5 text-sm dark:border-white/10 dark:bg-zinc-900"
          >
            <option value="">Any type</option>
            {TYPE_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <select
            name="risk"
            defaultValue={riskFilter}
            className="rounded border border-black/10 bg-white px-3 py-1.5 text-sm dark:border-white/10 dark:bg-zinc-900"
          >
            <option value="">Any risk</option>
            {RISK_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <select
            name="category"
            defaultValue={categoryFilter}
            className="rounded border border-black/10 bg-white px-3 py-1.5 text-sm dark:border-white/10 dark:bg-zinc-900"
          >
            <option value="">Any category</option>
            {Object.values(IncidentCategory).map((value) => (
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
          {(q || statusFilter || typeFilter || riskFilter || categoryFilter) && (
            <a
              href="/changes"
              className="rounded-full border border-black/10 px-4 py-1.5 text-sm font-medium dark:border-white/10"
            >
              Clear
            </a>
          )}
        </form>

        <ChangeGroup
          title="Awaiting approval"
          emptyMessage="Nothing waiting on a decision right now."
          changes={awaitingApproval}
        />

        <ChangeGroup
          title="Results"
          emptyMessage="No changes match these filters."
          changes={changes}
        />
      </main>
    </div>
  );
}
