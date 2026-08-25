"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/src/lib/prisma";
import { getActiveUser } from "@/src/lib/session";
import { isAgentRole } from "@/src/types/itil";
import { Role } from "@/app/generated/prisma/client";
import { buildNotification } from "@/src/lib/notifications";

// Same shape as incident-workflow.ts / problem-workflow.ts / change-
// workflow.ts: load who's acting, load the record, check the ITIL
// permission rule, write inside a transaction alongside an audit-trail
// row and any notifications, then revalidate. Kept self-contained here
// rather than importing from the other three, so all four lifecycles
// stay fully independent files.

async function requireActiveUser() {
  const activeUser = await getActiveUser();
  if (!activeUser) {
    redirect("/login");
  }
  return activeUser;
}

function getRequestId(formData: FormData): string {
  const requestId = formData.get("requestId");
  if (typeof requestId !== "string" || requestId.length === 0) {
    throw new Error("Missing requestId.");
  }
  return requestId;
}

async function loadServiceRequest(requestId: string) {
  const serviceRequest = await prisma.serviceRequest.findUnique({
    where: { id: requestId },
    include: { requester: true, fulfiller: true },
  });
  if (!serviceRequest) {
    throw new Error("Service request not found.");
  }
  return serviceRequest;
}

function revalidateServiceRequest(requestId: string) {
  revalidatePath(`/requests/${requestId}`);
  revalidatePath("/requests");
}

/** Approve a request that's waiting on a manager, APPROVAL_REQUIRED only. */
export async function approveServiceRequest(formData: FormData) {
  const activeUser = await requireActiveUser();
  const requestId = getRequestId(formData);
  const approvalNotes = formData.get("approvalNotes");

  if (activeUser.role !== Role.MANAGER) {
    throw new Error("Only a manager can approve a service request.");
  }

  const serviceRequest = await loadServiceRequest(requestId);
  if (serviceRequest.status !== "PENDING_APPROVAL") {
    throw new Error("This request isn't waiting on approval.");
  }

  await prisma.$transaction([
    prisma.serviceRequest.update({
      where: { id: requestId },
      data: {
        approvedById: activeUser.id,
        approvalNotes: typeof approvalNotes === "string" ? approvalNotes.trim() || null : null,
        status: "APPROVED",
      },
    }),
    prisma.serviceRequestActivity.create({
      data: {
        serviceRequestId: requestId,
        actorId: activeUser.id,
        type: "APPROVED",
        message: `${activeUser.name} approved this request.`,
      },
    }),
    buildNotification({
      recipientId: serviceRequest.requesterId,
      subject: `Approved: ${serviceRequest.requestNumber} (${serviceRequest.title})`,
      body: `${activeUser.name} approved your request. It's now waiting to be fulfilled.`,
    }),
  ]);

  revalidateServiceRequest(requestId);
}

/** Reject a request that's waiting on a manager. */
export async function rejectServiceRequest(formData: FormData) {
  const activeUser = await requireActiveUser();
  const requestId = getRequestId(formData);
  const approvalNotes = formData.get("approvalNotes");

  if (activeUser.role !== Role.MANAGER) {
    throw new Error("Only a manager can reject a service request.");
  }
  if (typeof approvalNotes !== "string" || approvalNotes.trim().length === 0) {
    throw new Error("A reason is required to reject a service request.");
  }

  const serviceRequest = await loadServiceRequest(requestId);
  if (serviceRequest.status !== "PENDING_APPROVAL") {
    throw new Error("This request isn't waiting on approval.");
  }

  await prisma.$transaction([
    prisma.serviceRequest.update({
      where: { id: requestId },
      data: {
        approvedById: activeUser.id,
        approvalNotes: approvalNotes.trim(),
        status: "REJECTED",
      },
    }),
    prisma.serviceRequestActivity.create({
      data: {
        serviceRequestId: requestId,
        actorId: activeUser.id,
        type: "REJECTED",
        message: `${activeUser.name} rejected this request. Reason: ${approvalNotes.trim()}`,
      },
    }),
    buildNotification({
      recipientId: serviceRequest.requesterId,
      subject: `Rejected: ${serviceRequest.requestNumber} (${serviceRequest.title})`,
      body: `${activeUser.name} rejected your request. Reason: ${approvalNotes.trim()}`,
    }),
  ]);

  revalidateServiceRequest(requestId);
}

/**
 * Take a request into the fulfillment queue: an agent or manager assigns
 * it to themselves. Requires SUBMITTED (a STANDARD request, never needed
 * approval) or APPROVED (an APPROVAL_REQUIRED request that already
 * cleared approval), never PENDING_APPROVAL, an agent can't start
 * fulfilling something a manager hasn't signed off on yet.
 */
export async function takeServiceRequest(formData: FormData) {
  const activeUser = await requireActiveUser();
  const requestId = getRequestId(formData);

  if (!isAgentRole(activeUser.role)) {
    throw new Error("Only agents and managers can take a service request.");
  }

  const serviceRequest = await loadServiceRequest(requestId);
  if (serviceRequest.status !== "SUBMITTED" && serviceRequest.status !== "APPROVED") {
    throw new Error("This request isn't ready to be worked yet.");
  }

  await prisma.$transaction([
    prisma.serviceRequest.update({
      where: { id: requestId },
      data: { fulfillerId: activeUser.id, status: "IN_PROGRESS" },
    }),
    prisma.serviceRequestActivity.create({
      data: {
        serviceRequestId: requestId,
        actorId: activeUser.id,
        type: "ASSIGNED",
        message: `${activeUser.name} took this request and started fulfilling it.`,
      },
    }),
    buildNotification({
      recipientId: serviceRequest.requesterId,
      subject: `We're on it: ${serviceRequest.requestNumber} (${serviceRequest.title})`,
      body: `${activeUser.name} is now working on your request.`,
    }),
  ]);

  revalidateServiceRequest(requestId);
}

/**
 * A manager hand-picks a specific agent, same relation to
 * takeServiceRequest as reassignIncident has to takeIncident.
 */
export async function reassignServiceRequest(formData: FormData) {
  const activeUser = await requireActiveUser();
  const requestId = getRequestId(formData);
  const fulfillerId = formData.get("fulfillerId");

  if (activeUser.role !== Role.MANAGER) {
    throw new Error("Only a manager can reassign a service request to a specific agent.");
  }
  if (typeof fulfillerId !== "string" || fulfillerId.length === 0) {
    throw new Error("Missing fulfillerId.");
  }

  const newFulfiller = await prisma.user.findUnique({ where: { id: fulfillerId } });
  if (!newFulfiller || !isAgentRole(newFulfiller.role)) {
    throw new Error("Can only assign a service request to an agent or manager.");
  }

  const serviceRequest = await loadServiceRequest(requestId);
  if (
    serviceRequest.status !== "SUBMITTED" &&
    serviceRequest.status !== "APPROVED" &&
    serviceRequest.status !== "IN_PROGRESS"
  ) {
    throw new Error("This request isn't ready to be assigned yet.");
  }

  await prisma.$transaction([
    prisma.serviceRequest.update({
      where: { id: requestId },
      data: { fulfillerId: newFulfiller.id, status: "IN_PROGRESS" },
    }),
    prisma.serviceRequestActivity.create({
      data: {
        serviceRequestId: requestId,
        actorId: activeUser.id,
        type: "ASSIGNED",
        message: `${activeUser.name} assigned this request to ${newFulfiller.name}.`,
      },
    }),
    buildNotification({
      recipientId: newFulfiller.id,
      subject: `Assigned to you: ${serviceRequest.requestNumber} (${serviceRequest.title})`,
      body: `${activeUser.name} assigned this request to you.`,
    }),
  ]);

  revalidateServiceRequest(requestId);
}

/** Fulfill: the ask has been completed. */
export async function fulfillServiceRequest(formData: FormData) {
  const activeUser = await requireActiveUser();
  const requestId = getRequestId(formData);
  const fulfillmentNotes = formData.get("fulfillmentNotes");

  if (!isAgentRole(activeUser.role)) {
    throw new Error("Only agents and managers can fulfill a service request.");
  }
  if (typeof fulfillmentNotes !== "string" || fulfillmentNotes.trim().length === 0) {
    throw new Error("Fulfillment notes are required.");
  }

  const serviceRequest = await loadServiceRequest(requestId);
  if (serviceRequest.status !== "IN_PROGRESS") {
    throw new Error("This request isn't in progress.");
  }

  await prisma.$transaction([
    prisma.serviceRequest.update({
      where: { id: requestId },
      data: {
        fulfillmentNotes: fulfillmentNotes.trim(),
        fulfilledAt: new Date(),
        status: "FULFILLED",
      },
    }),
    prisma.serviceRequestActivity.create({
      data: {
        serviceRequestId: requestId,
        actorId: activeUser.id,
        type: "FULFILLED",
        message: `${activeUser.name} fulfilled this request.`,
      },
    }),
    buildNotification({
      recipientId: serviceRequest.requesterId,
      subject: `Fulfilled: ${serviceRequest.requestNumber} (${serviceRequest.title})`,
      body: `${activeUser.name} fulfilled your request. ${fulfillmentNotes.trim()}`,
    }),
  ]);

  revalidateServiceRequest(requestId);
}

/** Close: requester or manager confirms, same rule as closeIncident. */
export async function closeServiceRequest(formData: FormData) {
  const activeUser = await requireActiveUser();
  const requestId = getRequestId(formData);

  const serviceRequest = await loadServiceRequest(requestId);
  if (serviceRequest.status !== "FULFILLED") {
    throw new Error("Only a fulfilled request can be closed.");
  }
  const canClose = activeUser.id === serviceRequest.requesterId || activeUser.role === Role.MANAGER;
  if (!canClose) {
    throw new Error("Only the requester or a manager can close a service request.");
  }

  await prisma.$transaction([
    prisma.serviceRequest.update({
      where: { id: requestId },
      data: { status: "CLOSED", closedAt: new Date() },
    }),
    prisma.serviceRequestActivity.create({
      data: {
        serviceRequestId: requestId,
        actorId: activeUser.id,
        type: "CLOSED",
        message: `${activeUser.name} confirmed this request and closed it.`,
      },
    }),
    ...(activeUser.id !== serviceRequest.requesterId
      ? [
          buildNotification({
            recipientId: serviceRequest.requesterId,
            subject: `Closed: ${serviceRequest.requestNumber} (${serviceRequest.title})`,
            body: `${activeUser.name} closed this request on your behalf.`,
          }),
        ]
      : []),
  ]);

  revalidateServiceRequest(requestId);
}

/**
 * Cancel: the requester changed their mind, or a manager cancels on their
 * behalf. Only possible while the request is still active, not once it's
 * already been fulfilled, closed, rejected, or cancelled.
 */
export async function cancelServiceRequest(formData: FormData) {
  const activeUser = await requireActiveUser();
  const requestId = getRequestId(formData);

  const serviceRequest = await loadServiceRequest(requestId);
  const canCancel = activeUser.id === serviceRequest.requesterId || activeUser.role === Role.MANAGER;
  if (!canCancel) {
    throw new Error("Only the requester or a manager can cancel a service request.");
  }
  const cancellableStatuses = ["SUBMITTED", "PENDING_APPROVAL", "APPROVED", "IN_PROGRESS"];
  if (!cancellableStatuses.includes(serviceRequest.status)) {
    throw new Error("This request can no longer be cancelled.");
  }

  await prisma.$transaction([
    prisma.serviceRequest.update({
      where: { id: requestId },
      data: { status: "CANCELLED", closedAt: new Date() },
    }),
    prisma.serviceRequestActivity.create({
      data: {
        serviceRequestId: requestId,
        actorId: activeUser.id,
        type: "CANCELLED",
        message: `${activeUser.name} cancelled this request.`,
      },
    }),
    ...(activeUser.id !== serviceRequest.requesterId
      ? [
          buildNotification({
            recipientId: serviceRequest.requesterId,
            subject: `Cancelled: ${serviceRequest.requestNumber} (${serviceRequest.title})`,
            body: `${activeUser.name} cancelled this request on your behalf.`,
          }),
        ]
      : []),
  ]);

  revalidateServiceRequest(requestId);
}

/** A plain comment, open to every role, including the requester, same as Incident's addComment. */
export async function addServiceRequestComment(formData: FormData) {
  const activeUser = await requireActiveUser();
  const requestId = getRequestId(formData);
  const message = formData.get("message");

  if (typeof message !== "string" || message.trim().length === 0) {
    throw new Error("Comment message is required.");
  }

  const serviceRequest = await loadServiceRequest(requestId);
  const otherPartyId =
    activeUser.id === serviceRequest.requesterId
      ? serviceRequest.fulfillerId
      : serviceRequest.requesterId;

  await prisma.$transaction([
    prisma.serviceRequestActivity.create({
      data: {
        serviceRequestId: requestId,
        actorId: activeUser.id,
        type: "COMMENT",
        message: message.trim(),
      },
    }),
    ...(otherPartyId && otherPartyId !== activeUser.id
      ? [
          buildNotification({
            recipientId: otherPartyId,
            subject: `New comment on ${serviceRequest.requestNumber} (${serviceRequest.title})`,
            body: `${activeUser.name}: ${message.trim()}`,
          }),
        ]
      : []),
  ]);

  revalidateServiceRequest(requestId);
}
