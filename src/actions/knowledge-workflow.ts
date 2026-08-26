"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/src/lib/prisma";
import { getActiveUser } from "@/src/lib/session";
import { isAgentRole } from "@/src/types/itil";
import type { IncidentCategory } from "@/app/generated/prisma/client";

// Same shape as every workflow file in this app: load who's acting, load
// the record, check the permission rule, write the change (plus an
// audit-trail row), then revalidate. No manager-only step here, unlike
// Problem/Change's closeProblem/closeChange: publishing, retiring, or
// editing an article is ordinary content upkeep, not a governance
// decision that needs a manager's sign-off the way closing a formal
// investigation does.

async function requireAgentUser() {
  const activeUser = await getActiveUser();
  if (!activeUser) {
    redirect("/login");
  }
  if (!isAgentRole(activeUser.role)) {
    throw new Error("Only agents and managers can maintain knowledge base articles.");
  }
  return activeUser;
}

function getArticleId(formData: FormData): string {
  const articleId = formData.get("articleId");
  if (typeof articleId !== "string" || articleId.length === 0) {
    throw new Error("Missing articleId.");
  }
  return articleId;
}

async function loadArticle(articleId: string) {
  const article = await prisma.knowledgeArticle.findUnique({ where: { id: articleId } });
  if (!article) {
    throw new Error("Article not found.");
  }
  return article;
}

function revalidateArticle(articleId: string) {
  revalidatePath(`/knowledge-base/${articleId}`);
  revalidatePath("/knowledge-base");
}

/**
 * Publish an article: makes it searchable and eligible to be linked to an
 * incident. Works from DRAFT (the normal case) or RETIRED (bringing back
 * an article that turned out to still be useful), the single button on
 * the detail page just reads "Publish" either way.
 */
export async function publishArticle(formData: FormData) {
  const activeUser = await requireAgentUser();
  const articleId = getArticleId(formData);

  const article = await loadArticle(articleId);
  if (article.status === "PUBLISHED") {
    throw new Error("This article is already published.");
  }

  await prisma.$transaction([
    prisma.knowledgeArticle.update({ where: { id: articleId }, data: { status: "PUBLISHED" } }),
    prisma.knowledgeArticleActivity.create({
      data: {
        articleId,
        actorId: activeUser.id,
        type: "PUBLISHED",
        message: `${activeUser.name} published this article.`,
      },
    }),
  ]);

  revalidateArticle(articleId);
}

/**
 * Retire an article: takes it out of search and off the "link to an
 * incident" list, without deleting it, since it might still be worth
 * republishing later if the underlying advice turns out to still apply.
 */
export async function retireArticle(formData: FormData) {
  const activeUser = await requireAgentUser();
  const articleId = getArticleId(formData);

  const article = await loadArticle(articleId);
  if (article.status !== "PUBLISHED") {
    throw new Error("Only a published article can be retired.");
  }

  await prisma.$transaction([
    prisma.knowledgeArticle.update({ where: { id: articleId }, data: { status: "RETIRED" } }),
    prisma.knowledgeArticleActivity.create({
      data: {
        articleId,
        actorId: activeUser.id,
        type: "RETIRED",
        message: `${activeUser.name} retired this article.`,
      },
    }),
  ]);

  revalidateArticle(articleId);
}

/**
 * Edit an article's content, allowed regardless of status: fixing a typo
 * in a live article, or reworking a retired one before republishing it,
 * are both real reasons to edit without changing the lifecycle step
 * itself.
 */
export async function updateArticleContent(formData: FormData) {
  const activeUser = await requireAgentUser();
  const articleId = getArticleId(formData);

  const title = formData.get("title");
  const category = formData.get("category");
  const symptoms = formData.get("symptoms");
  const solution = formData.get("solution");

  if (
    typeof title !== "string" ||
    typeof category !== "string" ||
    typeof symptoms !== "string" ||
    typeof solution !== "string" ||
    title.trim().length === 0 ||
    symptoms.trim().length === 0 ||
    solution.trim().length === 0
  ) {
    throw new Error("Title, category, symptoms, and solution are all required.");
  }

  await loadArticle(articleId);

  await prisma.$transaction([
    prisma.knowledgeArticle.update({
      where: { id: articleId },
      data: {
        title: title.trim(),
        category: category as IncidentCategory,
        symptoms: symptoms.trim(),
        solution: solution.trim(),
      },
    }),
    prisma.knowledgeArticleActivity.create({
      data: {
        articleId,
        actorId: activeUser.id,
        type: "EDITED",
        message: `${activeUser.name} edited this article.`,
      },
    }),
  ]);

  revalidateArticle(articleId);
}
