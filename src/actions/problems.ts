"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/src/lib/prisma";
import { getActiveUser } from "@/src/lib/session";
import { derivePriority, isAgentRole } from "@/src/types/itil";
import type { Impact, Urgency, IncidentCategory } from "@/app/generated/prisma/client";
import { buildNotification } from "@/src/lib/notifications";

/**
 * Raise a new Problem, standalone or (when `sourceIncidentId` is present)
 * as an investigation triggered by a specific Incident, in which case that
 * Incident gets linked to the new Problem automatically. Same field set
 * and priority derivation as createIncident, just for the Problem side of
 * the process, and internal-only (isAgentRole), unlike Incident creation
 * which any signed-in customer can do.
 */
export async function createProblem(formData: FormData) {
  const activeUser = await getActiveUser();
  if (!activeUser) {
    redirect("/login");
  }
  if (!isAgentRole(activeUser.role)) {
    throw new Error("Only agents and managers can raise a problem.");
  }

  const title = formData.get("title");
  const description = formData.get("description");
  const category = formData.get("category");
  const impact = formData.get("impact");
  const urgency = formData.get("urgency");
  const sourceIncidentId = formData.get("sourceIncidentId");

  if (
    typeof title !== "string" ||
    typeof description !== "string" ||
    typeof category !== "string" ||
    typeof impact !== "string" ||
    typeof urgency !== "string" ||
    title.trim().length === 0 ||
    description.trim().length === 0
  ) {
    throw new Error("Title, description, category, impact and urgency are all required.");
  }

  const priority = derivePriority(impact as Impact, urgency as Urgency);

  // Same cosmetic, count-based numbering approach as createIncident (see
  // the comment there for the known limitation), just with a "PRB" prefix.
  const existingCount = await prisma.problem.count();
  const problemNumber = `PRB${String(existingCount + 1).padStart(6, "0")}`;

  const problem = await prisma.problem.create({
    data: {
      problemNumber,
      title: title.trim(),
      description: description.trim(),
      category: category as IncidentCategory,
      impact: impact as Impact,
      urgency: urgency as Urgency,
      priority,
      raisedById: activeUser.id,
    },
  });

  await prisma.problemActivity.create({
    data: {
      problemId: problem.id,
      actorId: activeUser.id,
      type: "CREATED",
      message: `Problem raised by ${activeUser.name}.`,
    },
  });

  if (typeof sourceIncidentId === "string" && sourceIncidentId.length > 0) {
    const incident = await prisma.incident.findUnique({ where: { id: sourceIncidentId } });
    if (incident && incident.problemId === null) {
      await prisma.$transaction([
        prisma.incident.update({
          where: { id: sourceIncidentId },
          data: { problemId: problem.id },
        }),
        prisma.incidentActivity.create({
          data: {
            incidentId: sourceIncidentId,
            actorId: activeUser.id,
            type: "PROBLEM_LINKED",
            message: `${activeUser.name} linked this incident to problem ${problem.problemNumber}.`,
          },
        }),
        prisma.problemActivity.create({
          data: {
            problemId: problem.id,
            actorId: activeUser.id,
            type: "INCIDENT_LINKED",
            message: `Linked to incident ${incident.ticketNumber}: ${incident.title}.`,
          },
        }),
      ]);
    }
  }

  redirect(`/problems/${problem.id}?created=1`);
}

/**
 * Link an already-existing Incident to an already-existing Problem, e.g.
 * "this is another instance of that recurring VPN issue." Posted from the
 * incident detail page itself, so it revalidates rather than redirecting.
 *
 * The single most useful payoff of Problem Management this app makes
 * visible: if the Problem is already a Known Error, the agent working
 * this incident gets its documented workaround immediately, both on the
 * incident page itself and as a notification if someone else is
 * assigned, instead of re-diagnosing something already understood.
 */
export async function linkIncidentToProblem(formData: FormData) {
  const activeUser = await getActiveUser();
  if (!activeUser) {
    redirect("/login");
  }
  if (!isAgentRole(activeUser.role)) {
    throw new Error("Only agents and managers can link an incident to a problem.");
  }

  const incidentId = formData.get("incidentId");
  const problemId = formData.get("problemId");
  if (typeof incidentId !== "string" || incidentId.length === 0) {
    throw new Error("Missing incidentId.");
  }
  if (typeof problemId !== "string" || problemId.length === 0) {
    throw new Error("Missing problemId.");
  }

  const incident = await prisma.incident.findUnique({ where: { id: incidentId } });
  if (!incident) {
    throw new Error("Incident not found.");
  }
  if (incident.problemId !== null) {
    throw new Error("This incident is already linked to a problem.");
  }

  const problem = await prisma.problem.findUnique({ where: { id: problemId } });
  if (!problem) {
    throw new Error("Problem not found.");
  }

  const notifyAssignee =
    problem.status === "KNOWN_ERROR" &&
    incident.assigneeId !== null &&
    incident.assigneeId !== activeUser.id &&
    problem.workaround !== null;

  await prisma.$transaction([
    prisma.incident.update({ where: { id: incidentId }, data: { problemId: problem.id } }),
    prisma.incidentActivity.create({
      data: {
        incidentId,
        actorId: activeUser.id,
        type: "PROBLEM_LINKED",
        message: `${activeUser.name} linked this incident to problem ${problem.problemNumber}.`,
      },
    }),
    prisma.problemActivity.create({
      data: {
        problemId: problem.id,
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
            subject: `Known workaround available for ${incident.ticketNumber}`,
            body: `This ticket was just linked to problem ${problem.problemNumber} (${problem.title}), which already has a documented workaround: ${problem.workaround}`,
          }),
        ]
      : []),
  ]);

  revalidatePath(`/incidents/${incidentId}`);
  revalidatePath(`/problems/${problem.id}`);
}
