import Link from "next/link";
import { CATEGORY_LABELS } from "@/src/types/itil";
import type { KnowledgeArticle, User } from "@/app/generated/prisma/client";

// Sibling to problem-list.tsx/change-list.tsx, same reasoning: a
// KnowledgeArticle is its own record shape, so it gets its own small file
// rather than branching an existing list component on "what kind of row
// is this."

export type KnowledgeArticleRow = KnowledgeArticle & {
  author: User;
  _count: { incidents: number };
};

const STATUS_TONE: Record<string, string> = {
  DRAFT: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  PUBLISHED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  RETIRED: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
};

export function KnowledgeArticleListItem({ article }: { article: KnowledgeArticleRow }) {
  return (
    <li>
      <Link
        href={`/knowledge-base/${article.id}`}
        className="block rounded-lg border border-black/10 bg-white p-4 transition-colors hover:border-black/20 dark:border-white/10 dark:bg-zinc-900 dark:hover:border-white/20"
      >
        <div className="flex items-center justify-between text-xs font-medium text-zinc-500">
          <span>{article.articleNumber}</span>
          <div className="flex gap-2">
            <span className={`rounded-full px-2 py-0.5 ${STATUS_TONE[article.status]}`}>
              {article.status}
            </span>
            <span>{CATEGORY_LABELS[article.category]}</span>
          </div>
        </div>
        <p className="mt-1 font-medium text-black dark:text-zinc-50">{article.title}</p>
        <p className="mt-1 line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400">
          {article.symptoms}
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          By {article.author.name}, linked to {article._count.incidents} incident
          {article._count.incidents === 1 ? "" : "s"}
        </p>
      </Link>
    </li>
  );
}

export function KnowledgeArticleGroup({
  title,
  emptyMessage,
  articles,
}: {
  title: string;
  emptyMessage: string;
  articles: KnowledgeArticleRow[];
}) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-black dark:text-zinc-50">
        {title} ({articles.length})
      </h2>
      {articles.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{emptyMessage}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {articles.map((article) => (
            <KnowledgeArticleListItem key={article.id} article={article} />
          ))}
        </ul>
      )}
    </section>
  );
}

export function KnowledgeArticlePageHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">{title}</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{subtitle}</p>
      </div>
      <Link
        href="/knowledge-base/new"
        className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
      >
        Write New Article
      </Link>
    </div>
  );
}
