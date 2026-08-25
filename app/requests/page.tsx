import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/src/lib/prisma";
import { getActiveUser } from "@/src/lib/session";
import { getDemoSessionId, demoSessionFilter } from "@/src/lib/demo-session";
import { CATEGORY_LABELS, isAgentRole } from "@/src/types/itil";
import { Role, IncidentCategory, ServiceRequestStatus } from "@/app/generated/prisma/client";
import type { Prisma } from "@/app/generated/prisma/client";
import {
  ServiceRequestGroup,
  ServiceRequestPageHeader,
  type ServiceRequestRow,
} from "@/src/components/service-request-list";
import { SERVICE_REQUEST_CATALOG } from "@/src/data/service-request-catalog";

export const dynamic = "force-dynamic";

const STATUS_OPTIONS = Object.values(ServiceRequestStatus);
const CATEGORY_OPTIONS = Object.values(IncidentCategory);

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

// Unlike /problems and /changes (agent/manager only), this page is open
// to every role, a Service Request is customer-facing, same as Incident.
// Visibility is one WHERE clause branch (customer sees only their own),
// the same shape app/incidents/page.tsx already uses, rather than three
// separate role-branched render paths.
export default async function ServiceRequestsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const q = firstValue(params.q)?.trim() ?? "";
  const statusFilter = firstValue(params.status) ?? "";
  const categoryFilter = firstValue(params.category) ?? "";

  const activeUser = await getActiveUser();
  if (!activeUser) {
    redirect("/login");
  }

  const demoSessionId = await getDemoSessionId();
  const isCustomer = activeUser.role === Role.CUSTOMER;

  // Customer only ever sees their own requests, same visibility rule as
  // Incident; agents and managers see every request, the same full
  // internal-visibility rule Problem/Change already use, since fulfilling
  // requests is shared queue work, not tiered the way Incident escalation is.
  const visibilityWhere: Prisma.ServiceRequestWhereInput = isCustomer
    ? { requesterId: activeUser.id }
    : {};

  const filters: Prisma.ServiceRequestWhereInput[] = [visibilityWhere, demoSessionFilter(demoSessionId)];
  if (q.length > 0) {
    filters.push({
      OR: [
        { requestNumber: { contains: q, mode: "insensitive" } },
        { title: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
      ],
    });
  }
  if (STATUS_OPTIONS.includes(statusFilter as ServiceRequestStatus)) {
    filters.push({ status: statusFilter as ServiceRequestStatus });
  }
  if (CATEGORY_OPTIONS.includes(categoryFilter as IncidentCategory)) {
    filters.push({ category: categoryFilter as IncidentCategory });
  }

  const [awaitingApproval, queue, results] = await Promise.all([
    activeUser.role === Role.MANAGER
      ? prisma.serviceRequest.findMany({
          where: { AND: [{ status: "PENDING_APPROVAL" }, demoSessionFilter(demoSessionId)] },
          orderBy: { createdAt: "asc" },
          include: { requester: true, fulfiller: true },
        })
      : Promise.resolve([] as ServiceRequestRow[]),
    isAgentRole(activeUser.role)
      ? prisma.serviceRequest.findMany({
          where: {
            AND: [
              { fulfillerId: null, status: { in: ["SUBMITTED", "APPROVED"] } },
              demoSessionFilter(demoSessionId),
            ],
          },
          orderBy: { createdAt: "asc" },
          include: { requester: true, fulfiller: true },
        })
      : Promise.resolve([] as ServiceRequestRow[]),
    prisma.serviceRequest.findMany({
      where: { AND: filters },
      orderBy: { createdAt: "desc" },
      include: { requester: true, fulfiller: true },
    }),
  ]);

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-3xl flex-col gap-6 py-16 px-6">
        <ServiceRequestPageHeader
          title="Service Request Management"
          subtitle="Ask IT for something routine, new equipment, access, a password reset."
        />

        <p className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300">
          A <strong>Service Request</strong> is different from an{" "}
          <strong>Incident</strong>: nothing&apos;s broken, you&apos;re just
          asking for something standard, a password reset, a new laptop,
          access to a folder. Pick one of the common requests below to get
          started with the details already filled in, or log something
          else. Some requests are <strong>pre-approved</strong> and go
          straight to the fulfillment queue; others{" "}
          <strong>need a manager&apos;s sign-off</strong> first, that&apos;s
          decided by what you&apos;re asking for, not something you choose
          yourself.
        </p>

        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-black dark:text-zinc-50">Common requests</h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {SERVICE_REQUEST_CATALOG.map((item) => (
              <Link
                key={item.slug}
                href={`/requests/new?catalog=${item.slug}`}
                className="rounded-lg border border-black/10 bg-white p-3 text-sm transition-colors hover:border-black/20 dark:border-white/10 dark:bg-zinc-900 dark:hover:border-white/20"
              >
                <p className="font-medium text-black dark:text-zinc-50">{item.title}</p>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {CATEGORY_LABELS[item.category]} ·{" "}
                  {item.requestType === "STANDARD" ? "Pre-approved" : "Needs approval"}
                </p>
              </Link>
            ))}
          </div>
        </section>

        <form className="flex flex-wrap gap-2 rounded-lg border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Search title, description, or request number..."
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
          {(q || statusFilter || categoryFilter) && (
            <a
              href="/requests"
              className="rounded-full border border-black/10 px-4 py-1.5 text-sm font-medium dark:border-white/10"
            >
              Clear
            </a>
          )}
        </form>

        {activeUser.role === Role.MANAGER && (
          <ServiceRequestGroup
            title="Awaiting approval"
            emptyMessage="Nothing waiting on a decision right now."
            requests={awaitingApproval}
          />
        )}

        {isAgentRole(activeUser.role) && (
          <ServiceRequestGroup
            title="Unclaimed queue"
            emptyMessage="Nothing waiting to be picked up right now."
            requests={queue}
          />
        )}

        <ServiceRequestGroup
          title={isCustomer ? "Your requests" : "Results"}
          emptyMessage={
            isCustomer ? "You haven't submitted any requests yet." : "No requests match these filters."
          }
          requests={results}
        />
      </main>
    </div>
  );
}
