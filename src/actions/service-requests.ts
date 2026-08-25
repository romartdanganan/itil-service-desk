"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/src/lib/prisma";
import { getActiveUser } from "@/src/lib/session";
import { getDemoSessionId } from "@/src/lib/demo-session";
import { nextSequentialNumber } from "@/src/lib/sequential-number";
import type { IncidentCategory, ServiceRequestType } from "@/app/generated/prisma/client";

/**
 * Submit a new Service Request. Anyone signed in can submit one, this is
 * customer-facing, same as Incident, unlike Problem/Change, and the
 * requester is always whoever's submitting. `requestType` decides which
 * queue this lands in first: STANDARD (a pre-approved catalog item) goes
 * straight to SUBMITTED, ready for the fulfillment queue; anything else
 * waits on a manager first, PENDING_APPROVAL. See ServiceRequest in
 * prisma/schema.prisma for why there's no third, emergency-style path
 * here the way Change has one.
 */
export async function createServiceRequest(formData: FormData) {
  const activeUser = await getActiveUser();
  if (!activeUser) {
    redirect("/login");
  }

  const title = formData.get("title");
  const description = formData.get("description");
  const category = formData.get("category");
  const requestType = formData.get("requestType");

  if (
    typeof title !== "string" ||
    typeof description !== "string" ||
    typeof category !== "string" ||
    typeof requestType !== "string" ||
    title.trim().length === 0 ||
    description.trim().length === 0 ||
    (requestType !== "STANDARD" && requestType !== "APPROVAL_REQUIRED")
  ) {
    // The <form> below always sends a valid requestType (either a hidden
    // field from a catalog pick or the "custom request" default), so a
    // normal user can't hit this in practice, same "don't trust the
    // browser is the only thing posting here" reasoning as createIncident.
    throw new Error("Title, description, category, and request type are all required.");
  }

  // See src/lib/sequential-number.ts for why this is derived from the
  // highest existing request number, not a row count.
  const lastRequest = await prisma.serviceRequest.findFirst({
    orderBy: { requestNumber: "desc" },
    select: { requestNumber: true },
  });
  const requestNumber = nextSequentialNumber(lastRequest?.requestNumber ?? null, "SR");
  const initialStatus = requestType === "STANDARD" ? "SUBMITTED" : "PENDING_APPROVAL";

  const serviceRequest = await prisma.serviceRequest.create({
    data: {
      requestNumber,
      title: title.trim(),
      description: description.trim(),
      category: category as IncidentCategory,
      requestType: requestType as ServiceRequestType,
      status: initialStatus,
      requesterId: activeUser.id,
      demoSessionId: await getDemoSessionId(),
    },
  });

  await prisma.serviceRequestActivity.create({
    data: {
      serviceRequestId: serviceRequest.id,
      actorId: activeUser.id,
      type: "SUBMITTED",
      message:
        requestType === "STANDARD"
          ? `${activeUser.name} submitted this request. Pre-approved, ready for fulfillment.`
          : `${activeUser.name} submitted this request for manager approval.`,
    },
  });

  redirect(`/requests/${serviceRequest.id}?created=1`);
}
