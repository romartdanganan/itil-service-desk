"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/src/lib/prisma";
import { getActiveUser } from "@/src/lib/session";
import { getDemoSessionId } from "@/src/lib/demo-session";
import { nextSequentialNumber } from "@/src/lib/sequential-number";
import { isAgentRole } from "@/src/types/itil";
import { ChangeType } from "@/app/generated/prisma/client";
import type { ChangeRisk, IncidentCategory } from "@/app/generated/prisma/client";

/**
 * Raise a new Change, standalone or (when `sourceProblemId` is present)
 * as the delivery work for a specific Problem's fix, in which case that
 * Problem gets linked automatically. Internal only (isAgentRole), same
 * as Problem creation, customers don't request infrastructure changes.
 *
 * A STANDARD change is auto-approved at creation, by definition it's
 * routine, pre-approved work, no manager action needed to begin it.
 * Everything else (NORMAL, EMERGENCY) starts REQUESTED.
 */
export async function createChange(formData: FormData) {
  const activeUser = await getActiveUser();
  if (!activeUser) {
    redirect("/login");
  }
  if (!isAgentRole(activeUser.role)) {
    throw new Error("Only agents and managers can raise a change.");
  }

  const title = formData.get("title");
  const description = formData.get("description");
  const category = formData.get("category");
  const changeType = formData.get("changeType");
  const risk = formData.get("risk");
  const implementationPlan = formData.get("implementationPlan");
  const backoutPlan = formData.get("backoutPlan");
  const plannedStart = formData.get("plannedStart");
  const plannedEnd = formData.get("plannedEnd");
  const sourceProblemId = formData.get("sourceProblemId");

  if (
    typeof title !== "string" ||
    typeof description !== "string" ||
    typeof category !== "string" ||
    typeof changeType !== "string" ||
    typeof risk !== "string" ||
    typeof implementationPlan !== "string" ||
    typeof backoutPlan !== "string" ||
    typeof plannedStart !== "string" ||
    typeof plannedEnd !== "string" ||
    title.trim().length === 0 ||
    description.trim().length === 0 ||
    implementationPlan.trim().length === 0 ||
    backoutPlan.trim().length === 0
  ) {
    throw new Error(
      "Title, description, category, change type, risk, implementation plan, backout plan, and the planned window are all required.",
    );
  }

  const start = new Date(plannedStart);
  const end = new Date(plannedEnd);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    throw new Error("The planned window must be a valid start and end, with end after start.");
  }

  // See src/lib/sequential-number.ts for why this is derived from the
  // highest existing change number, not a row count.
  const lastChange = await prisma.change.findFirst({
    orderBy: { changeNumber: "desc" },
    select: { changeNumber: true },
  });
  const changeNumber = nextSequentialNumber(lastChange?.changeNumber ?? null, "CHG");
  const demoSessionId = await getDemoSessionId();

  let linkedProblemId: string | undefined;
  if (typeof sourceProblemId === "string" && sourceProblemId.length > 0) {
    const sourceProblem = await prisma.problem.findUnique({ where: { id: sourceProblemId } });
    if (sourceProblem && (!sourceProblem.demoSessionId || sourceProblem.demoSessionId === demoSessionId)) {
      linkedProblemId = sourceProblem.id;
    }
  }

  const change = await prisma.change.create({
    data: {
      changeNumber,
      title: title.trim(),
      description: description.trim(),
      category: category as IncidentCategory,
      changeType: changeType as ChangeType,
      risk: risk as ChangeRisk,
      implementationPlan: implementationPlan.trim(),
      backoutPlan: backoutPlan.trim(),
      plannedStart: start,
      plannedEnd: end,
      status: changeType === ChangeType.STANDARD ? "APPROVED" : "REQUESTED",
      requestedById: activeUser.id,
      demoSessionId,
      ...(linkedProblemId ? { sourceProblemId: linkedProblemId } : {}),
    },
  });

  await prisma.changeActivity.create({
    data: {
      changeId: change.id,
      actorId: activeUser.id,
      type: "CREATED",
      message:
        changeType === ChangeType.STANDARD
          ? `${activeUser.name} raised this standard change, auto-approved.`
          : `${activeUser.name} raised this change for approval.`,
    },
  });

  redirect(`/changes/${change.id}?created=1`);
}
