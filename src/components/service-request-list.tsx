import Link from "next/link";
import { CATEGORY_LABELS } from "@/src/types/itil";
import type { ServiceRequest, User } from "@/app/generated/prisma/client";

// Sibling to incident-list.tsx / problem-list.tsx / change-list.tsx, not
// an extension of any of them, same reasoning: a ServiceRequest is its
// own record shape (no SLA, no tier, an approval step that only sometimes
// applies), so sharing a file would mean branching on "which kind of row
// is this" throughout instead of one small, single-purpose file.

export type ServiceRequestRow = ServiceRequest & {
  requester: User;
  fulfiller: User | null;
};

const CLOSED_STATUSES = new Set<ServiceRequest["status"]>([
  "FULFILLED",
  "CLOSED",
  "REJECTED",
  "CANCELLED",
]);

export function isOpenServiceRequestStatus(status: ServiceRequest["status"]): boolean {
  return !CLOSED_STATUSES.has(status);
}

export function ServiceRequestListItem({ request }: { request: ServiceRequestRow }) {
  return (
    <li>
      <Link
        href={`/requests/${request.id}`}
        className="block rounded-lg border border-black/10 bg-white p-4 transition-colors hover:border-black/20 dark:border-white/10 dark:bg-zinc-900 dark:hover:border-white/20"
      >
        <div className="flex items-center justify-between text-xs font-medium text-zinc-500">
          <span>{request.requestNumber}</span>
          <div className="flex gap-2">
            {request.requestType === "APPROVAL_REQUIRED" && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                Needs approval
              </span>
            )}
            <span>{CATEGORY_LABELS[request.category]}</span>
          </div>
        </div>
        <p className="mt-1 font-medium text-black dark:text-zinc-50">{request.title}</p>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Status: {request.status.replace("_", " ")} · Requested by{" "}
          {request.requester.name} · Fulfiller: {request.fulfiller?.name ?? "Unassigned"}
        </p>
      </Link>
    </li>
  );
}

export function ServiceRequestGroup({
  title,
  emptyMessage,
  requests,
}: {
  title: string;
  emptyMessage: string;
  requests: ServiceRequestRow[];
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-black dark:text-zinc-50">
        {title} ({requests.length})
      </h2>
      {requests.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{emptyMessage}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {requests.map((request) => (
            <ServiceRequestListItem key={request.id} request={request} />
          ))}
        </ul>
      )}
    </section>
  );
}

export function ServiceRequestPageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">{title}</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{subtitle}</p>
      </div>
      <Link
        href="/requests/new"
        className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
      >
        Log New Request
      </Link>
    </div>
  );
}
