"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/src/lib/prisma";
import { getActiveUser } from "@/src/lib/session";
import { isAgentRole } from "@/src/types/itil";
import { Role } from "@/app/generated/prisma/client";
import { buildNotification } from "@/src/lib/notifications";

// Same shape as every action in incident-workflow.ts: load who's acting,
// load the record, check the permission rule, write the change inside a
// transaction that also records an audit-trail row and any notifications,
// then revalidate. Kept self-contained here (its own local helpers) rather
// than importing from incident-workflow.ts, so the two lifecycles stay
// fully independent files.

async function requireActiveUser() {
  const activeUser = await getActiveUser();
  if (!activeUser) {
    redirect("/login");
  }
  return activeUser;
}

function getProblemId(formData: FormData): string {
  const problemId = formData.get("problemId");
  if (typeof problemId !== "string" || problemId.length === 0) {
    throw new Error("Missing problemId.");
  }
  return problemId;
}

async function loadProblem(problemId: string) {
  const problem = await prisma.problem.findUnique({
    where: { id: problemId },
    include: { owner: true, raisedBy: true },
  });
  if (!problem) {
    throw new Error("Problem not found.");
  }
  return problem;
}

function revalidateProblem(problemId: string) {
  revalidatePath(`/problems/${problemId}`);
  revalidatePath("/problems");
}

/**
 * Take a problem: an agent or manager assigns it to themselves. Status
 * only advances NEW -> INVESTIGATING the first time a problem gets an
 * owner; re-taking a problem that's already past NEW (e.g. picking it
 * back up after it became a Known Error) leaves status untouched.
 */
export async function takeProblem(formData: FormData) {
  const activeUser = await requireActiveUser();
  const problemId = getProblemId(formData);

  if (!isAgentRole(activeUser.role)) {
    throw new Error("Only agents and managers can take a problem.");
  }

  const problem = await loadProblem(problemId);
  const isFirstOwner = problem.ownerId === null;

  await prisma.$transaction([
    prisma.problem.update({
      where: { id: problemId },
      data: {
        ownerId: activeUser.id,
        ...(problem.status === "NEW" ? { status: "INVESTIGATING" as const } : {}),
      },
    }),
    prisma.problemActivity.create({
      data: {
        problemId,
        actorId: activeUser.id,
        type: "ASSIGNED",
        message: `${activeUser.name} took this problem and started investigating.`,
      },
    }),
    ...(isFirstOwner && problem.raisedById !== activeUser.id
      ? [
          buildNotification({
            recipientId: problem.raisedById,
            subject: `Investigation started: ${problem.problemNumber} (${problem.title})`,
            body: `${activeUser.name} is now investigating the problem you raised.`,
          }),
        ]
      : []),
  ]);

  revalidateProblem(problemId);
}

/**
 * A manager hand-picks a specific agent to own the problem, same relation
 * to takeProblem as reassignIncident has to takeIncident.
 */
export async function reassignProblem(formData: FormData) {
  const activeUser = await requireActiveUser();
  const problemId = getProblemId(formData);
  const ownerId = formData.get("ownerId");

  if (activeUser.role !== Role.MANAGER) {
    throw new Error("Only a manager can reassign a problem to a specific agent.");
  }
  if (typeof ownerId !== "string" || ownerId.length === 0) {
    throw new Error("Missing ownerId.");
  }

  const newOwner = await prisma.user.findUnique({ where: { id: ownerId } });
  if (!newOwner || !isAgentRole(newOwner.role)) {
    throw new Error("Can only assign a problem to an agent or manager.");
  }

  const problem = await loadProblem(problemId);

  await prisma.$transaction([
    prisma.problem.update({
      where: { id: problemId },
      data: {
        ownerId: newOwner.id,
        ...(problem.status === "NEW" ? { status: "INVESTIGATING" as const } : {}),
      },
    }),
    prisma.problemActivity.create({
      data: {
        problemId,
        actorId: activeUser.id,
        type: "ASSIGNED",
        message: `${activeUser.name} assigned this problem to ${newOwner.name}.`,
      },
    }),
    buildNotification({
      recipientId: newOwner.id,
      subject: `Assigned to you: ${problem.problemNumber} (${problem.title})`,
      body: `${activeUser.name} assigned this problem to you.`,
    }),
  ]);

  revalidateProblem(problemId);
}

/**
 * Record a workaround: this is the action that actually turns a Problem
 * into a Known Error. There's no separate "mark as known error" step, on
 * purpose, so the workaround text and the status can never say different
 * things. Every open, assigned incident already linked to this problem
 * gets its assignee notified proactively, since this is the moment their
 * ticket has a real answer available, whether or not they thought to
 * check back on the problem themselves.
 */
export async function recordWorkaround(formData: FormData) {
  const activeUser = await requireActiveUser();
  const problemId = getProblemId(formData);
  const workaround = formData.get("workaround");

  if (!isAgentRole(activeUser.role)) {
    throw new Error("Only agents and managers can record a workaround.");
  }
  if (typeof workaround !== "string" || workaround.trim().length === 0) {
    throw new Error("A workaround description is required.");
  }

  const problem = await loadProblem(problemId);
  if (problem.status === "RESOLVED" || problem.status === "CLOSED") {
    throw new Error("Can't record a workaround on a problem that's already resolved or closed.");
  }
  const trimmedWorkaround = workaround.trim();

  const affectedIncidents = await prisma.incident.findMany({
    where: {
      problemId,
      status: { in: ["NEW", "IN_PROGRESS", "ON_HOLD"] },
      assigneeId: { not: null },
    },
  });
  const notifyAssigneeIds = new Set(
    affectedIncidents
      .map((incident) => incident.assigneeId as string)
      .filter((assigneeId) => assigneeId !== activeUser.id),
  );

  await prisma.$transaction([
    prisma.problem.update({
      where: { id: problemId },
      data: { workaround: trimmedWorkaround, workaroundAt: new Date(), status: "KNOWN_ERROR" },
    }),
    prisma.problemActivity.create({
      data: {
        problemId,
        actorId: activeUser.id,
        type: "WORKAROUND_RECORDED",
        message: `${activeUser.name} recorded a workaround; this problem is now a Known Error.`,
      },
    }),
    ...affectedIncidents
      .filter((incident) => notifyAssigneeIds.has(incident.assigneeId as string))
      .map((incident) =>
        buildNotification({
          recipientId: incident.assigneeId as string,
          incidentId: incident.id,
          subject: `Workaround available for a problem behind ${incident.ticketNumber}`,
          body: `A workaround was just documented for problem ${problem.problemNumber} (${problem.title}), which this ticket is linked to: ${trimmedWorkaround}`,
        }),
      ),
  ]);

  revalidateProblem(problemId);
  for (const incident of affectedIncidents) {
    revalidatePath(`/incidents/${incident.id}`);
  }
}

/**
 * Resolve: the permanent fix is in place, with its root cause on record.
 * Doesn't require having passed through Known Error first, since the
 * permanent fix is sometimes found immediately with no interim
 * workaround ever needed.
 */
export async function resolveProblem(formData: FormData) {
  const activeUser = await requireActiveUser();
  const problemId = getProblemId(formData);
  const rootCause = formData.get("rootCause");

  if (!isAgentRole(activeUser.role)) {
    throw new Error("Only agents and managers can resolve a problem.");
  }
  if (typeof rootCause !== "string" || rootCause.trim().length === 0) {
    throw new Error("A root cause is required to resolve a problem.");
  }

  const problem = await loadProblem(problemId);
  if (problem.status === "RESOLVED" || problem.status === "CLOSED") {
    throw new Error("This problem is already resolved.");
  }

  await prisma.$transaction([
    prisma.problem.update({
      where: { id: problemId },
      data: { rootCause: rootCause.trim(), resolvedAt: new Date(), status: "RESOLVED" },
    }),
    prisma.problemActivity.create({
      data: {
        problemId,
        actorId: activeUser.id,
        type: "RESOLVED",
        message: `${activeUser.name} resolved this problem.`,
      },
    }),
    ...(problem.raisedById !== activeUser.id
      ? [
          buildNotification({
            recipientId: problem.raisedById,
            subject: `Resolved: ${problem.problemNumber} (${problem.title})`,
            body: `${activeUser.name} found the root cause and resolved this problem.`,
          }),
        ]
      : []),
  ]);

  revalidateProblem(problemId);
}

/**
 * Close: manager-only, unlike closeIncident's requester-or-manager rule.
 * A Problem has no customer whose confirmation closure hinges on; it's
 * purely an internal governance step, so it's reserved for the manager.
 */
export async function closeProblem(formData: FormData) {
  const activeUser = await requireActiveUser();
  const problemId = getProblemId(formData);

  if (activeUser.role !== Role.MANAGER) {
    throw new Error("Only a manager can close a problem.");
  }

  const problem = await loadProblem(problemId);
  if (problem.status !== "RESOLVED") {
    throw new Error("Only a resolved problem can be closed.");
  }

  await prisma.$transaction([
    prisma.problem.update({
      where: { id: problemId },
      data: { status: "CLOSED", closedAt: new Date() },
    }),
    prisma.problemActivity.create({
      data: {
        problemId,
        actorId: activeUser.id,
        type: "CLOSED",
        message: `${activeUser.name} closed this problem.`,
      },
    }),
  ]);

  revalidateProblem(problemId);
}

/** A comment on a problem, agent/manager only, never open to customers. */
export async function addProblemComment(formData: FormData) {
  const activeUser = await requireActiveUser();
  const problemId = getProblemId(formData);
  const message = formData.get("message");

  if (!isAgentRole(activeUser.role)) {
    throw new Error("Only agents and managers can comment on a problem.");
  }
  if (typeof message !== "string" || message.trim().length === 0) {
    throw new Error("Comment message is required.");
  }

  const problem = await loadProblem(problemId);

  await prisma.$transaction([
    prisma.problemActivity.create({
      data: {
        problemId,
        actorId: activeUser.id,
        type: "COMMENT",
        message: message.trim(),
      },
    }),
    ...(problem.ownerId && problem.ownerId !== activeUser.id
      ? [
          buildNotification({
            recipientId: problem.ownerId,
            subject: `New comment on ${problem.problemNumber} (${problem.title})`,
            body: `${activeUser.name}: ${message.trim()}`,
          }),
        ]
      : []),
  ]);

  revalidateProblem(problemId);
}
