"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/src/lib/prisma";
import { getActiveUser } from "@/src/lib/session";
import { getNextTier, isAgentRole } from "@/src/types/itil";
import { Role } from "@/app/generated/prisma/client";

// Every action below follows the same shape: load who's acting, load the
// incident they're acting on, check the ITIL rule for "is this person
// allowed to do this to a ticket in this state", write the change, and
// record an IncidentActivity row so the ticket keeps an audit trail. That
// last part isn't optional bookkeeping — "why did this ticket move from
// L1 to L2 at 3pm" is exactly the question a real service desk has to be
// able to answer.

async function requireActiveUser() {
  const activeUser = await getActiveUser();
  if (!activeUser) {
    redirect("/");
  }
  return activeUser;
}

function getIncidentId(formData: FormData): string {
  const incidentId = formData.get("incidentId");
  if (typeof incidentId !== "string" || incidentId.length === 0) {
    throw new Error("Missing incidentId.");
  }
  return incidentId;
}

async function loadIncident(incidentId: string) {
  const incident = await prisma.incident.findUnique({
    where: { id: incidentId },
    include: { assignee: true, requester: true },
  });
  if (!incident) {
    throw new Error("Incident not found.");
  }
  return incident;
}

function revalidateIncident(incidentId: string) {
  revalidatePath(`/incidents/${incidentId}`);
  revalidatePath("/");
}

/**
 * "Take" a ticket: an agent or manager assigns it to themselves. This is
 * how a ticket goes from sitting unowned in a tier's queue to someone
 * actually working it — the first real step of the incident lifecycle
 * after it's logged.
 */
export async function takeIncident(formData: FormData) {
  const activeUser = await requireActiveUser();
  const incidentId = getIncidentId(formData);

  if (!isAgentRole(activeUser.role)) {
    throw new Error("Only agents and managers can take a ticket.");
  }

  await prisma.$transaction([
    prisma.incident.update({
      where: { id: incidentId },
      data: {
        assigneeId: activeUser.id,
        status: "IN_PROGRESS",
      },
    }),
    prisma.incidentActivity.create({
      data: {
        incidentId,
        actorId: activeUser.id,
        type: "ASSIGNED",
        message: `${activeUser.name} took this ticket and started work.`,
      },
    }),
  ]);

  revalidateIncident(incidentId);
}

/**
 * A manager hand-picks a specific agent to own the ticket, instead of an
 * agent self-assigning. Managers get visibility across every tier, so
 * they're the ones who can direct work anywhere — an L1 agent can't
 * assign a ticket to a named L3 specialist, only escalate to the tier.
 */
export async function reassignIncident(formData: FormData) {
  const activeUser = await requireActiveUser();
  const incidentId = getIncidentId(formData);
  const assigneeId = formData.get("assigneeId");

  if (activeUser.role !== Role.MANAGER) {
    throw new Error("Only a manager can reassign to a specific agent.");
  }
  if (typeof assigneeId !== "string" || assigneeId.length === 0) {
    throw new Error("Missing assigneeId.");
  }

  const newAssignee = await prisma.user.findUnique({ where: { id: assigneeId } });
  if (!newAssignee || !isAgentRole(newAssignee.role)) {
    throw new Error("Can only reassign to an agent or manager.");
  }

  await prisma.$transaction([
    prisma.incident.update({
      where: { id: incidentId },
      data: {
        assigneeId: newAssignee.id,
        status: "IN_PROGRESS",
      },
    }),
    prisma.incidentActivity.create({
      data: {
        incidentId,
        actorId: activeUser.id,
        type: "ASSIGNED",
        message: `${activeUser.name} reassigned this ticket to ${newAssignee.name}.`,
      },
    }),
  ]);

  revalidateIncident(incidentId);
}

/**
 * Escalate to the next support tier. In ITIL, escalation is a step UP the
 * chain — L1 can't fix it, it goes to L2, and so on — never back down to
 * the customer. We unassign the ticket rather than pick a specific person,
 * because "escalate" means "hand off to the next tier's queue", not "hand
 * off to one named person" (that's what reassign is for).
 */
export async function escalateIncident(formData: FormData) {
  const activeUser = await requireActiveUser();
  const incidentId = getIncidentId(formData);
  const reason = formData.get("reason");

  if (!isAgentRole(activeUser.role)) {
    throw new Error("Only agents and managers can escalate a ticket.");
  }
  if (typeof reason !== "string" || reason.trim().length === 0) {
    throw new Error("An escalation reason is required.");
  }

  const incident = await loadIncident(incidentId);
  const nextTier = getNextTier(incident.assignee?.role ?? null);

  if (nextTier === null) {
    throw new Error("This ticket is already at the highest support tier (L3).");
  }

  await prisma.$transaction([
    prisma.incident.update({
      where: { id: incidentId },
      data: {
        assigneeId: null,
        status: "IN_PROGRESS",
      },
    }),
    prisma.incidentActivity.create({
      data: {
        incidentId,
        actorId: activeUser.id,
        type: "ESCALATED",
        message: `${activeUser.name} escalated this ticket to ${nextTier}. Reason: ${reason.trim()}`,
      },
    }),
  ]);

  revalidateIncident(incidentId);
}

/**
 * Toggle between IN_PROGRESS and ON_HOLD. A ticket goes on hold when work
 * is blocked on something outside the agent's control (waiting on the
 * customer to reply, waiting on a vendor part) — it's still open and
 * assigned, just paused, which is why this doesn't touch the assignee.
 */
export async function setIncidentHold(formData: FormData) {
  const activeUser = await requireActiveUser();
  const incidentId = getIncidentId(formData);
  const hold = formData.get("hold") === "true";
  const note = formData.get("note");

  if (!isAgentRole(activeUser.role)) {
    throw new Error("Only agents and managers can change a ticket's status.");
  }

  const nextStatus = hold ? "ON_HOLD" : "IN_PROGRESS";
  const message = hold
    ? `${activeUser.name} put this ticket on hold.${typeof note === "string" && note.trim() ? ` Reason: ${note.trim()}` : ""}`
    : `${activeUser.name} resumed work on this ticket.`;

  await prisma.$transaction([
    prisma.incident.update({
      where: { id: incidentId },
      data: { status: nextStatus },
    }),
    prisma.incidentActivity.create({
      data: {
        incidentId,
        actorId: activeUser.id,
        type: "STATUS_CHANGED",
        message,
      },
    }),
  ]);

  revalidateIncident(incidentId);
}

/**
 * Resolve: the fix is in place. This is where we compare the resolution
 * time against the SLA target set at ticket creation and permanently
 * record whether the SLA was breached — that flag becomes the metric a
 * real service desk reports on ("what % of P1s did we resolve on time?").
 */
export async function resolveIncident(formData: FormData) {
  const activeUser = await requireActiveUser();
  const incidentId = getIncidentId(formData);
  const resolutionNotes = formData.get("resolutionNotes");

  if (!isAgentRole(activeUser.role)) {
    throw new Error("Only agents and managers can resolve a ticket.");
  }
  if (typeof resolutionNotes !== "string" || resolutionNotes.trim().length === 0) {
    throw new Error("Resolution notes are required to resolve a ticket.");
  }

  const incident = await loadIncident(incidentId);
  const resolvedAt = new Date();
  const slaBreached = resolvedAt > incident.slaResolveDueAt;

  await prisma.$transaction([
    prisma.incident.update({
      where: { id: incidentId },
      data: {
        status: "RESOLVED",
        resolutionNotes: resolutionNotes.trim(),
        resolvedAt,
        slaBreached,
      },
    }),
    prisma.incidentActivity.create({
      data: {
        incidentId,
        actorId: activeUser.id,
        type: "RESOLVED",
        message: `${activeUser.name} resolved this ticket.${slaBreached ? " (SLA breached)" : " (within SLA)"}`,
      },
    }),
  ]);

  revalidateIncident(incidentId);
}

/**
 * Close: ITIL treats this as a separate step from Resolve on purpose — the
 * requester (or a manager, on their behalf) confirms the fix actually
 * worked before the ticket is considered fully done. A ticket that's
 * RESOLVED but not yet CLOSED is still open in the sense that it can come
 * back if the fix didn't hold.
 */
export async function closeIncident(formData: FormData) {
  const activeUser = await requireActiveUser();
  const incidentId = getIncidentId(formData);

  const incident = await loadIncident(incidentId);

  if (incident.status !== "RESOLVED") {
    throw new Error("Only a resolved ticket can be closed.");
  }
  const canClose = activeUser.id === incident.requesterId || activeUser.role === Role.MANAGER;
  if (!canClose) {
    throw new Error("Only the requester or a manager can close a ticket.");
  }

  await prisma.$transaction([
    prisma.incident.update({
      where: { id: incidentId },
      data: { status: "CLOSED", closedAt: new Date() },
    }),
    prisma.incidentActivity.create({
      data: {
        incidentId,
        actorId: activeUser.id,
        type: "CLOSED",
        message: `${activeUser.name} confirmed the fix and closed this ticket.`,
      },
    }),
  ]);

  revalidateIncident(incidentId);
}

/** A plain comment — the one action open to every role, including the customer. */
export async function addComment(formData: FormData) {
  const activeUser = await requireActiveUser();
  const incidentId = getIncidentId(formData);
  const message = formData.get("message");

  if (typeof message !== "string" || message.trim().length === 0) {
    throw new Error("Comment message is required.");
  }

  await prisma.incidentActivity.create({
    data: {
      incidentId,
      actorId: activeUser.id,
      type: "COMMENT",
      message: message.trim(),
    },
  });

  revalidateIncident(incidentId);
}
