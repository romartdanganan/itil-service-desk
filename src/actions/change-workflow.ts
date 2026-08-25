"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/src/lib/prisma";
import { getActiveUser } from "@/src/lib/session";
import { isAgentRole, canStartWithoutApproval } from "@/src/types/itil";
import { Role } from "@/app/generated/prisma/client";
import { buildNotification } from "@/src/lib/notifications";

// Same shape as problem-workflow.ts: load who's acting, load the record,
// check the ITIL permission rule, write inside a transaction alongside an
// audit-trail row and any notifications, then revalidate. Kept
// self-contained (its own local helpers) rather than importing from
// problem-workflow.ts or incident-workflow.ts, so all three lifecycles
// stay fully independent files.

async function requireActiveUser() {
  const activeUser = await getActiveUser();
  if (!activeUser) {
    redirect("/login");
  }
  return activeUser;
}

function getChangeId(formData: FormData): string {
  const changeId = formData.get("changeId");
  if (typeof changeId !== "string" || changeId.length === 0) {
    throw new Error("Missing changeId.");
  }
  return changeId;
}

async function loadChange(changeId: string) {
  const change = await prisma.change.findUnique({
    where: { id: changeId },
    include: { requestedBy: true },
  });
  if (!change) {
    throw new Error("Change not found.");
  }
  return change;
}

function revalidateChange(changeId: string) {
  revalidatePath(`/changes/${changeId}`);
  revalidatePath("/changes");
}

/**
 * Approve a change. For the normal case (status REQUESTED) this also
 * moves status to APPROVED. For an EMERGENCY change already IN_PROGRESS
 * (started without waiting, see startChange), this only records the
 * retroactive sign-off, approvedById/approvalNotes, and leaves status
 * alone, an emergency change that's already underway isn't "approved,"
 * it's "underway and now also approved."
 */
export async function approveChange(formData: FormData) {
  const activeUser = await requireActiveUser();
  const changeId = getChangeId(formData);
  const approvalNotes = formData.get("approvalNotes");

  if (activeUser.role !== Role.MANAGER) {
    throw new Error("Only a manager can approve a change.");
  }

  const change = await loadChange(changeId);
  const isRetroactive = change.status === "IN_PROGRESS" && change.changeType === "EMERGENCY";
  if (change.status !== "REQUESTED" && !isRetroactive) {
    throw new Error("This change isn't waiting on approval.");
  }

  await prisma.$transaction([
    prisma.change.update({
      where: { id: changeId },
      data: {
        approvedById: activeUser.id,
        approvalNotes: typeof approvalNotes === "string" ? approvalNotes.trim() || null : null,
        ...(isRetroactive ? {} : { status: "APPROVED" }),
      },
    }),
    prisma.changeActivity.create({
      data: {
        changeId,
        actorId: activeUser.id,
        type: "APPROVED",
        message: isRetroactive
          ? `${activeUser.name} retroactively approved this emergency change.`
          : `${activeUser.name} approved this change.`,
      },
    }),
    buildNotification({
      recipientId: change.requestedById,
      subject: `Approved: ${change.changeNumber} (${change.title})`,
      body: `${activeUser.name} approved your change request.`,
    }),
  ]);

  revalidateChange(changeId);
}

/** Reject a change. Only possible while it's still waiting, REQUESTED. */
export async function rejectChange(formData: FormData) {
  const activeUser = await requireActiveUser();
  const changeId = getChangeId(formData);
  const approvalNotes = formData.get("approvalNotes");

  if (activeUser.role !== Role.MANAGER) {
    throw new Error("Only a manager can reject a change.");
  }
  if (typeof approvalNotes !== "string" || approvalNotes.trim().length === 0) {
    throw new Error("A reason is required to reject a change.");
  }

  const change = await loadChange(changeId);
  if (change.status !== "REQUESTED") {
    throw new Error("This change isn't waiting on approval.");
  }

  await prisma.$transaction([
    prisma.change.update({
      where: { id: changeId },
      data: {
        approvedById: activeUser.id,
        approvalNotes: approvalNotes.trim(),
        status: "REJECTED",
      },
    }),
    prisma.changeActivity.create({
      data: {
        changeId,
        actorId: activeUser.id,
        type: "REJECTED",
        message: `${activeUser.name} rejected this change. Reason: ${approvalNotes.trim()}`,
      },
    }),
    buildNotification({
      recipientId: change.requestedById,
      subject: `Rejected: ${change.changeNumber} (${change.title})`,
      body: `${activeUser.name} rejected your change request. Reason: ${approvalNotes.trim()}`,
    }),
  ]);

  revalidateChange(changeId);
}

/**
 * Start implementation. Requires approval first, APPROVED, except for an
 * EMERGENCY change, which can start straight from REQUESTED, see
 * canStartWithoutApproval in src/types/itil.ts.
 */
export async function startChange(formData: FormData) {
  const activeUser = await requireActiveUser();
  const changeId = getChangeId(formData);

  if (!isAgentRole(activeUser.role)) {
    throw new Error("Only agents and managers can start a change.");
  }

  const change = await loadChange(changeId);
  const canStart =
    change.status === "APPROVED" ||
    (change.status === "REQUESTED" && canStartWithoutApproval(change.changeType));
  if (!canStart) {
    throw new Error("This change isn't ready to start yet.");
  }

  await prisma.$transaction([
    prisma.change.update({
      where: { id: changeId },
      data: { implementedById: activeUser.id, status: "IN_PROGRESS" },
    }),
    prisma.changeActivity.create({
      data: {
        changeId,
        actorId: activeUser.id,
        type: "STARTED",
        message:
          change.status === "REQUESTED"
            ? `${activeUser.name} started this emergency change without waiting for approval.`
            : `${activeUser.name} started implementing this change.`,
      },
    }),
  ]);

  revalidateChange(changeId);
}

/**
 * Mark a change complete. Requires it to actually be in progress, and
 * requires approvedById to already be set, which for a NORMAL/STANDARD
 * change is already guaranteed by the time it's IN_PROGRESS, and for an
 * EMERGENCY change means the retroactive approval in approveChange has
 * to have happened first. One guard covers both cases.
 */
export async function completeChange(formData: FormData) {
  const activeUser = await requireActiveUser();
  const changeId = getChangeId(formData);
  const postImplementationNotes = formData.get("postImplementationNotes");

  if (!isAgentRole(activeUser.role)) {
    throw new Error("Only agents and managers can complete a change.");
  }
  if (typeof postImplementationNotes !== "string" || postImplementationNotes.trim().length === 0) {
    throw new Error("Post-implementation notes are required to complete a change.");
  }

  const change = await loadChange(changeId);
  if (change.status !== "IN_PROGRESS") {
    throw new Error("This change isn't in progress.");
  }
  if (!change.approvedById) {
    throw new Error("This emergency change needs retroactive approval before it can be completed.");
  }

  await prisma.$transaction([
    prisma.change.update({
      where: { id: changeId },
      data: {
        postImplementationNotes: postImplementationNotes.trim(),
        completedAt: new Date(),
        status: "COMPLETED",
      },
    }),
    prisma.changeActivity.create({
      data: {
        changeId,
        actorId: activeUser.id,
        type: "COMPLETED",
        message: `${activeUser.name} completed this change.`,
      },
    }),
    buildNotification({
      recipientId: change.requestedById,
      subject: `Completed: ${change.changeNumber} (${change.title})`,
      body: `${activeUser.name} completed this change. ${postImplementationNotes.trim()}`,
    }),
  ]);

  revalidateChange(changeId);
}

/**
 * Record a failed change, rolled back per its backoutPlan. Not every
 * change succeeds, and tracking that honestly (rather than only ever
 * having "completed") is the whole point of requiring a backout plan at
 * creation in the first place.
 */
export async function failChange(formData: FormData) {
  const activeUser = await requireActiveUser();
  const changeId = getChangeId(formData);
  const postImplementationNotes = formData.get("postImplementationNotes");

  if (!isAgentRole(activeUser.role)) {
    throw new Error("Only agents and managers can record a failed change.");
  }
  if (typeof postImplementationNotes !== "string" || postImplementationNotes.trim().length === 0) {
    throw new Error("Notes on what went wrong are required.");
  }

  const change = await loadChange(changeId);
  if (change.status !== "IN_PROGRESS") {
    throw new Error("This change isn't in progress.");
  }
  if (!change.approvedById) {
    throw new Error("This emergency change needs retroactive approval before it can be closed out.");
  }

  await prisma.$transaction([
    prisma.change.update({
      where: { id: changeId },
      data: {
        postImplementationNotes: postImplementationNotes.trim(),
        completedAt: new Date(),
        status: "FAILED",
      },
    }),
    prisma.changeActivity.create({
      data: {
        changeId,
        actorId: activeUser.id,
        type: "FAILED",
        message: `${activeUser.name} rolled this change back. ${postImplementationNotes.trim()}`,
      },
    }),
    buildNotification({
      recipientId: change.requestedById,
      subject: `Failed: ${change.changeNumber} (${change.title})`,
      body: `${activeUser.name} had to roll this change back. ${postImplementationNotes.trim()}`,
    }),
  ]);

  revalidateChange(changeId);
}

/** Close: manager-only governance step, same as closeProblem. */
export async function closeChange(formData: FormData) {
  const activeUser = await requireActiveUser();
  const changeId = getChangeId(formData);

  if (activeUser.role !== Role.MANAGER) {
    throw new Error("Only a manager can close a change.");
  }

  const change = await loadChange(changeId);
  if (change.status !== "COMPLETED" && change.status !== "FAILED") {
    throw new Error("Only a completed or failed change can be closed.");
  }

  await prisma.$transaction([
    prisma.change.update({
      where: { id: changeId },
      data: { status: "CLOSED", closedAt: new Date() },
    }),
    prisma.changeActivity.create({
      data: {
        changeId,
        actorId: activeUser.id,
        type: "CLOSED",
        message: `${activeUser.name} closed this change.`,
      },
    }),
  ]);

  revalidateChange(changeId);
}

/** A comment on a change, agent/manager only, never open to customers. */
export async function addChangeComment(formData: FormData) {
  const activeUser = await requireActiveUser();
  const changeId = getChangeId(formData);
  const message = formData.get("message");

  if (!isAgentRole(activeUser.role)) {
    throw new Error("Only agents and managers can comment on a change.");
  }
  if (typeof message !== "string" || message.trim().length === 0) {
    throw new Error("Comment message is required.");
  }

  const change = await loadChange(changeId);

  await prisma.$transaction([
    prisma.changeActivity.create({
      data: {
        changeId,
        actorId: activeUser.id,
        type: "COMMENT",
        message: message.trim(),
      },
    }),
    ...(change.requestedById !== activeUser.id
      ? [
          buildNotification({
            recipientId: change.requestedById,
            subject: `New comment on ${change.changeNumber} (${change.title})`,
            body: `${activeUser.name}: ${message.trim()}`,
          }),
        ]
      : []),
  ]);

  revalidateChange(changeId);
}
