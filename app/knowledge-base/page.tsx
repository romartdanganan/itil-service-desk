import { redirect } from "next/navigation";
import { prisma } from "@/src/lib/prisma";
import { getActiveUser } from "@/src/lib/session";
import { getDemoSessionId, demoSessionFilter } from "@/src/lib/demo-session";
import { CATEGORY_LABELS, isAgentRole } from "@/src/types/itil";
import { IncidentCategory, KnowledgeArticleStatus } from "@/app/generated/prisma/client";
import type { Prisma } from "@/app/generated/prisma/client";
import { KnowledgeArticleGroup, KnowledgeArticlePageHeader } from "@/src/components/knowledge-article-list";

export const dynamic = "force-dynamic";

const STATUS_OPTIONS = Object.values(KnowledgeArticleStatus);

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

// Browse/search every knowledge base article, agent/manager only, never
// customer-facing, same reasoning as /problems: this is internal
// reference material for whoever's actually working a ticket, not a
// public help center.
export default async function KnowledgeBasePage({
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
  if (!isAgentRole(activeUser.role)) {
    redirect("/");
  }

  const demoSessionId = await getDemoSessionId();
  const filters: Prisma.KnowledgeArticleWhereInput[] = [demoSessionFilter(demoSessionId)];
  if (q.length > 0) {
    filters.push({
      OR: [
        { articleNumber: { contains: q, mode: "insensitive" } },
        { title: { contains: q, mode: "insensitive" } },
        { symptoms: { contains: q, mode: "insensitive" } },
        { solution: { contains: q, mode: "insensitive" } },
      ],
    });
  }
  if (STATUS_OPTIONS.includes(statusFilter as KnowledgeArticleStatus)) {
    filters.push({ status: statusFilter as KnowledgeArticleStatus });
  }
  if (Object.values(IncidentCategory).includes(categoryFilter as IncidentCategory)) {
    filters.push({ category: categoryFilter as IncidentCategory });
  }

  const [drafts, articles] = await Promise.all([
    prisma.knowledgeArticle.findMany({
      where: { status: "DRAFT", ...demoSessionFilter(demoSessionId) },
      orderBy: { createdAt: "asc" },
      include: { author: true, _count: { select: { incidents: true } } },
    }),
    prisma.knowledgeArticle.findMany({
      where: { AND: filters },
      orderBy: { createdAt: "desc" },
      include: { author: true, _count: { select: { incidents: true } } },
    }),
  ]);

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-3xl flex-col gap-6 py-16 px-6">
        <KnowledgeArticlePageHeader
          title="Knowledge Base"
          subtitle="Documented fixes and answers, agent and manager only."
        />

        <p className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300">
          A <strong>knowledge base article</strong> is reusable
          documentation of how to fix or answer something, so the next
          agent who runs into it doesn&apos;t start from scratch. This is
          different from a Problem&apos;s Known Error: a Known Error only
          exists once a formal root-cause investigation is underway, while
          most articles here answer routine questions that never needed
          one. Write one directly, or from a resolved problem&apos;s own
          page. New articles start as a <strong>draft</strong>, publish one
          once it&apos;s ready to actually be linked to a ticket.
        </p>

        <form className="flex flex-wrap gap-2 rounded-lg border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Search title, symptoms, solution, or article number..."
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
          {(q || statusFilter || categoryFilter) && (
            <a
              href="/knowledge-base"
              className="rounded-full border border-black/10 px-4 py-1.5 text-sm font-medium dark:border-white/10"
            >
              Clear
            </a>
          )}
        </form>

        <KnowledgeArticleGroup
          title="Drafts awaiting publish"
          emptyMessage="Nothing waiting to be published right now."
          articles={drafts}
        />

        <KnowledgeArticleGroup
          title="Results"
          emptyMessage="No articles match these filters."
          articles={articles}
        />
      </main>
    </div>
  );
}
