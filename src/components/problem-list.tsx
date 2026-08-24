import Link from "next/link";
import { PRIORITY_LABELS } from "@/src/types/itil";
import type { Problem, User } from "@/app/generated/prisma/client";

// Sibling to incident-list.tsx, not an extension of it: a Problem and an
// Incident are different records with different fields (no SLA, an owner
// instead of an assignee/tier), so sharing one file would mean branching
// on "which kind of row is this" throughout instead of two small,
// single-purpose files.

export type ProblemRow = Problem & {
  owner: User | null;
  raisedBy: User;
  _count: { incidents: number };
};

export function isOpenProblemStatus(status: Problem["status"]): boolean {
  return status !== "RESOLVED" && status !== "CLOSED";
}

export function ProblemListItem({ problem }: { problem: ProblemRow }) {
  return (
    <li>
      <Link
        href={`/problems/${problem.id}`}
        className="block rounded-lg border border-black/10 bg-white p-4 transition-colors hover:border-black/20 dark:border-white/10 dark:bg-zinc-900 dark:hover:border-white/20"
      >
        <div className="flex items-center justify-between text-xs font-medium text-zinc-500">
          <span>{problem.problemNumber}</span>
          <div className="flex gap-2">
            {problem.status === "KNOWN_ERROR" && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                Known error
              </span>
            )}
            <span>{PRIORITY_LABELS[problem.priority]}</span>
          </div>
        </div>
        <p className="mt-1 font-medium text-black dark:text-zinc-50">{problem.title}</p>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Status: {problem.status.replace("_", " ")}, owner: {problem.owner?.name ?? "Unowned"},{" "}
          {problem._count.incidents} linked incident{problem._count.incidents === 1 ? "" : "s"}
        </p>
      </Link>
    </li>
  );
}

export function ProblemGroup({
  title,
  emptyMessage,
  problems,
}: {
  title: string;
  emptyMessage: string;
  problems: ProblemRow[];
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-black dark:text-zinc-50">
        {title} ({problems.length})
      </h2>
      {problems.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{emptyMessage}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {problems.map((problem) => (
            <ProblemListItem key={problem.id} problem={problem} />
          ))}
        </ul>
      )}
    </section>
  );
}

export function ProblemPageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">{title}</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{subtitle}</p>
      </div>
      <Link
        href="/problems/new"
        className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
      >
        Log New Problem
      </Link>
    </div>
  );
}
