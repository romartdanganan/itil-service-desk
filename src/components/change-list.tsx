import Link from "next/link";
import type { Change, User } from "@/app/generated/prisma/client";

// Sibling to problem-list.tsx / incident-list.tsx, not an extension of
// either: a Change has its own fields (a planned window, an approval
// chain, a backout plan) that don't map onto either of those.

export type ChangeRow = Change & { requestedBy: User };

const STATUS_TONE: Record<Change["status"], string> = {
  REQUESTED: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  APPROVED: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  REJECTED: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  IN_PROGRESS: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  COMPLETED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  FAILED: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  CLOSED: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
};

export function ChangeListItem({ change }: { change: ChangeRow }) {
  return (
    <li>
      <Link
        href={`/changes/${change.id}`}
        className="block rounded-lg border border-black/10 bg-white p-4 transition-colors hover:border-black/20 dark:border-white/10 dark:bg-zinc-900 dark:hover:border-white/20"
      >
        <div className="flex items-center justify-between text-xs font-medium text-zinc-500">
          <span>{change.changeNumber}</span>
          <div className="flex gap-2">
            {change.risk === "HIGH" && (
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-800 dark:bg-red-950 dark:text-red-300">
                High risk
              </span>
            )}
            <span className={`rounded-full px-2 py-0.5 ${STATUS_TONE[change.status]}`}>
              {change.status.replace("_", " ")}
            </span>
          </div>
        </div>
        <p className="mt-1 font-medium text-black dark:text-zinc-50">{change.title}</p>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          {change.changeType}, requested by {change.requestedBy.name}, planned{" "}
          {change.plannedStart.toLocaleDateString()}
        </p>
      </Link>
    </li>
  );
}

export function ChangeGroup({
  title,
  emptyMessage,
  changes,
}: {
  title: string;
  emptyMessage: string;
  changes: ChangeRow[];
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-black dark:text-zinc-50">
        {title} ({changes.length})
      </h2>
      {changes.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{emptyMessage}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {changes.map((change) => (
            <ChangeListItem key={change.id} change={change} />
          ))}
        </ul>
      )}
    </section>
  );
}

export function ChangePageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">{title}</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{subtitle}</p>
      </div>
      <Link
        href="/changes/new"
        className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
      >
        Log New Change
      </Link>
    </div>
  );
}
