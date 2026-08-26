"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/src/lib/prisma";
import { getActiveUser } from "@/src/lib/session";
import { getDemoSessionId, demoSessionFilter } from "@/src/lib/demo-session";
import { nextSequentialNumber } from "@/src/lib/sequential-number";
import { isAgentRole } from "@/src/types/itil";
import type { IncidentCategory } from "@/app/generated/prisma/client";
import { buildNotification } from "@/src/lib/notifications";

/**
 * Author a new knowledge base article, standalone or (when
 * `sourceProblemId` is present) written up from a Problem whose fix is
 * worth documenting for general reuse. Always starts as a DRAFT: writing
 * it down doesn't make it searchable or linkable to a ticket yet, see
 * publishArticle in knowledge-workflow.ts for that step.
 */
export async function createArticle(formData: FormData) {
  const activeUser = await getActiveUser();
  if (!activeUser) {
    redirect("/login");
  }
  if (!isAgentRole(activeUser.role)) {
    throw new Error("Only agents and managers can author a knowledge base article.");
  }

  const title = formData.get("title");
  const category = formData.get("category");
  const symptoms = formData.get("symptoms");
  const solution = formData.get("solution");
  const sourceProblemId = formData.get("sourceProblemId");

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

  const demoSessionId = await getDemoSessionId();

  let sourceProblem = null;
  if (typeof sourceProblemId === "string" && sourceProblemId.length > 0) {
    sourceProblem = await prisma.problem.findFirst({
      where: { id: sourceProblemId, ...demoSessionFilter(demoSessionId) },
    });
  }

  // See src/lib/sequential-number.ts for why this is derived from the
  // highest existing article number, not a row count.
  const lastArticle = await prisma.knowledgeArticle.findFirst({
    orderBy: { articleNumber: "desc" },
    select: { articleNumber: true },
  });
  const articleNumber = nextSequentialNumber(lastArticle?.articleNumber ?? null, "KB");

  const article = await prisma.knowledgeArticle.create({
    data: {
      articleNumber,
      title: title.trim(),
      category: category as IncidentCategory,
      symptoms: symptoms.trim(),
      solution: solution.trim(),
      authorId: activeUser.id,
      sourceProblemId: sourceProblem?.id ?? null,
      demoSessionId,
    },
  });

  await prisma.knowledgeArticleActivity.create({
    data: {
      articleId: article.id,
      actorId: activeUser.id,
      type: "CREATED",
      message: sourceProblem
        ? `${activeUser.name} wrote this article up from problem ${sourceProblem.problemNumber}.`
        : `${activeUser.name} wrote this article as a draft.`,
    },
  });

  redirect(`/knowledge-base/${article.id}?created=1`);
}

/**
 * Attach an already-published article to an incident as its documented
 * fix. Posted from the incident detail page, so it revalidates rather
 * than redirecting, the same "posted from the other record's page" shape
 * as linkIncidentToProblem in problems.ts.
 *
 * Only a PUBLISHED article can be linked: a draft hasn't been judged
 * ready to hand to a ticket yet. This is the real payoff of Knowledge
 * Management this app makes visible, the same idea as Problem's Known
 * Error linking: the agent working this incident gets the documented
 * solution immediately, both on the incident page itself and as a
 * notification if someone else is assigned, instead of re-solving
 * something already answered.
 */
export async function linkArticleToIncident(formData: FormData) {
  const activeUser = await getActiveUser();
  if (!activeUser) {
    redirect("/login");
  }
  if (!isAgentRole(activeUser.role)) {
    throw new Error("Only agents and managers can link a knowledge base article to an incident.");
  }

  const incidentId = formData.get("incidentId");
  const articleId = formData.get("articleId");
  if (typeof incidentId !== "string" || incidentId.length === 0) {
    throw new Error("Missing incidentId.");
  }
  if (typeof articleId !== "string" || articleId.length === 0) {
    throw new Error("Missing articleId.");
  }

  const demoSessionId = await getDemoSessionId();
  const incident = await prisma.incident.findUnique({ where: { id: incidentId } });
  if (!incident || (incident.demoSessionId && incident.demoSessionId !== demoSessionId)) {
    throw new Error("Incident not found.");
  }
  if (incident.knowledgeArticleId !== null) {
    throw new Error("This incident is already linked to a knowledge base article.");
  }

  const article = await prisma.knowledgeArticle.findUnique({ where: { id: articleId } });
  if (!article || (article.demoSessionId && article.demoSessionId !== demoSessionId)) {
    throw new Error("Article not found.");
  }
  if (article.status !== "PUBLISHED") {
    throw new Error("Only a published article can be linked to an incident.");
  }

  const notifyAssignee = incident.assigneeId !== null && incident.assigneeId !== activeUser.id;

  await prisma.$transaction([
    prisma.incident.update({ where: { id: incidentId }, data: { knowledgeArticleId: article.id } }),
    prisma.incidentActivity.create({
      data: {
        incidentId,
        actorId: activeUser.id,
        type: "ARTICLE_LINKED",
        message: `${activeUser.name} linked this incident to knowledge base article ${article.articleNumber}.`,
      },
    }),
    prisma.knowledgeArticleActivity.create({
      data: {
        articleId: article.id,
        actorId: activeUser.id,
        type: "INCIDENT_LINKED",
        message: `Linked to incident ${incident.ticketNumber}: ${incident.title}.`,
      },
    }),
    ...(notifyAssignee
      ? [
          buildNotification({
            recipientId: incident.assigneeId as string,
            incidentId,
            subject: `Documented fix available for ${incident.ticketNumber}`,
            body: `This ticket was just linked to knowledge base article ${article.articleNumber} (${article.title}): ${article.solution}`,
          }),
        ]
      : []),
  ]);

  revalidatePath(`/incidents/${incidentId}`);
  revalidatePath(`/knowledge-base/${article.id}`);
}
