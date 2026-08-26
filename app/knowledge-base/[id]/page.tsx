import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/src/lib/prisma";
import { getActiveUser } from "@/src/lib/session";
import { getDemoSessionId, demoSessionFilter } from "@/src/lib/demo-session";
import { CATEGORY_LABELS, isAgentRole } from "@/src/types/itil";
import { IncidentCategory } from "@/app/generated/prisma/client";
import {
  publishArticle,
  retireArticle,
  updateArticleContent,
} from "@/src/actions/knowledge-workflow";
import { IncidentListItem } from "@/src/components/incident-list";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, string> = {
  DRAFT: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
  PUBLISHED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  RETIRED: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
};

export default async function KnowledgeArticleDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { id } = await params;
  const { created } = await searchParams;

  const activeUser = await getActiveUser();
  if (!activeUser) {
    redirect("/login");
  }
  if (!isAgentRole(activeUser.role)) {
    redirect("/");
  }

  const demoSessionId = await getDemoSessionId();

  const article = await prisma.knowledgeArticle.findFirst({
    where: { id, ...demoSessionFilter(demoSessionId) },
    include: {
      author: true,
      sourceProblem: true,
      incidents: { include: { assignee: true, requester: true }, orderBy: { createdAt: "desc" } },
      activities: { include: { actor: true }, orderBy: { createdAt: "asc" } },
    },
  });

  if (!article) {
    notFound();
  }

  return (
    <div className="flex flex-col flex-1 items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-3xl flex-col gap-6 py-16 px-6">
        <Link
          href="/knowledge-base"
          className="text-sm text-zinc-500 underline dark:text-zinc-400"
        >
          Back to the knowledge base
        </Link>

        {created && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm dark:border-emerald-900 dark:bg-emerald-950/40">
            <p className="font-semibold text-emerald-900 dark:text-emerald-300">
              Saved as {article.articleNumber}
            </p>
            <p className="mt-1 text-emerald-800 dark:text-emerald-400">
              This is still a draft. Publish it below once it&apos;s ready to
              be searched and linked to a ticket.
            </p>
          </div>
        )}

        <div className="rounded-lg border border-black/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-medium text-zinc-500">{article.articleNumber}</span>
            <div className="flex gap-2">
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_TONE[article.status]}`}>
                {article.status}
              </span>
              <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                {CATEGORY_LABELS[article.category]}
              </span>
            </div>
          </div>

          <h1 className="mt-2 text-xl font-semibold text-black dark:text-zinc-50">
            {article.title}
          </h1>

          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <div>
              <dt className="text-zinc-500">Author</dt>
              <dd className="text-black dark:text-zinc-50">{article.author.name}</dd>
            </div>
            {article.sourceProblem && (
              <div>
                <dt className="text-zinc-500">Written up from</dt>
                <dd className="text-black dark:text-zinc-50">
                  <Link
                    href={`/problems/${article.sourceProblem.id}`}
                    className="underline"
                  >
                    {article.sourceProblem.problemNumber}
                  </Link>
                </dd>
              </div>
            )}
          </dl>

          <div className="mt-4">
            <p className="text-xs font-medium text-zinc-500">Symptoms</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">
              {article.symptoms}
            </p>
          </div>

          <div className="mt-4 rounded-md bg-emerald-50 p-3 dark:bg-emerald-950/40">
            <p className="text-xs font-medium text-emerald-900 dark:text-emerald-300">Solution</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-emerald-800 dark:text-emerald-400">
              {article.solution}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
            <h2 className="text-sm font-semibold text-black dark:text-zinc-50">Lifecycle</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {article.status !== "PUBLISHED" && (
                <form action={publishArticle}>
                  <input type="hidden" name="articleId" value={article.id} />
                  <button className="rounded-full bg-foreground px-4 py-1.5 text-xs font-medium text-background">
                    {article.status === "RETIRED" ? "Re-publish" : "Publish"}
                  </button>
                </form>
              )}
              {article.status === "PUBLISHED" && (
                <form action={retireArticle}>
                  <input type="hidden" name="articleId" value={article.id} />
                  <button className="rounded-full border border-black/10 px-4 py-1.5 text-xs font-medium dark:border-white/10">
                    Retire
                  </button>
                </form>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
            <h2 className="text-sm font-semibold text-black dark:text-zinc-50">Edit content</h2>
            <form action={updateArticleContent} className="mt-3 flex flex-col gap-3">
              <input type="hidden" name="articleId" value={article.id} />
              <div className="flex flex-col gap-1">
                <label htmlFor="title" className="text-xs font-medium text-zinc-500">
                  Title
                </label>
                <input
                  id="title"
                  name="title"
                  type="text"
                  required
                  defaultValue={article.title}
                  className="rounded border border-black/10 bg-white px-3 py-1.5 text-sm dark:border-white/10 dark:bg-zinc-900"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="category" className="text-xs font-medium text-zinc-500">
                  Category
                </label>
                <select
                  id="category"
                  name="category"
                  required
                  defaultValue={article.category}
                  className="rounded border border-black/10 bg-white px-3 py-1.5 text-sm dark:border-white/10 dark:bg-zinc-900"
                >
                  {Object.values(IncidentCategory).map((value) => (
                    <option key={value} value={value}>
                      {CATEGORY_LABELS[value]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="symptoms" className="text-xs font-medium text-zinc-500">
                  Symptoms
                </label>
                <textarea
                  id="symptoms"
                  name="symptoms"
                  required
                  rows={3}
                  defaultValue={article.symptoms}
                  className="rounded border border-black/10 bg-white px-3 py-1.5 text-sm dark:border-white/10 dark:bg-zinc-900"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label htmlFor="solution" className="text-xs font-medium text-zinc-500">
                  Solution
                </label>
                <textarea
                  id="solution"
                  name="solution"
                  required
                  rows={5}
                  defaultValue={article.solution}
                  className="rounded border border-black/10 bg-white px-3 py-1.5 text-sm dark:border-white/10 dark:bg-zinc-900"
                />
              </div>
              <button className="self-start rounded-full border border-black/10 px-4 py-1.5 text-xs font-medium dark:border-white/10">
                Save changes
              </button>
            </form>
          </div>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-black dark:text-zinc-50">
            Linked incidents ({article.incidents.length})
          </h2>
          {article.incidents.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              Not linked to any incident yet. An agent can link this from
              an open ticket&apos;s own page, once it&apos;s published.
            </p>
          ) : (
            <ul className="mt-3 flex flex-col gap-3">
              {article.incidents.map((incident) => (
                <IncidentListItem key={incident.id} incident={incident} />
              ))}
            </ul>
          )}
        </div>

        <div>
          <h2 className="text-sm font-semibold text-black dark:text-zinc-50">Activity</h2>
          <ol className="mt-3 flex flex-col gap-3">
            {article.activities.map((activity) => (
              <li
                key={activity.id}
                className="rounded-md border border-black/10 bg-white p-3 text-sm dark:border-white/10 dark:bg-zinc-900"
              >
                <div className="flex items-center justify-between text-xs text-zinc-500">
                  <span>
                    {activity.actor.name}, {activity.type.replace("_", " ")}
                  </span>
                  <span>{activity.createdAt.toLocaleString()}</span>
                </div>
                <p className="mt-1 text-black dark:text-zinc-50">{activity.message}</p>
              </li>
            ))}
          </ol>
        </div>
      </main>
    </div>
  );
}
