"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/src/lib/prisma";
import { getActiveUser } from "@/src/lib/session";
import { derivePriority, calculateSlaDueDates } from "@/src/types/itil";
import type { Impact, Urgency, IncidentCategory } from "@/app/generated/prisma/client";

export async function createIncident(formData: FormData) {
  const activeUser = await getActiveUser();
  if (!activeUser) {
    // No signed-in session — there is no one to record as the requester,
    // so there is nothing safe to do but send them to log in.
    redirect("/login");
  }

  const title = formData.get("title");
  const description = formData.get("description");
  const category = formData.get("category");
  const impact = formData.get("impact");
  const urgency = formData.get("urgency");

  if (
    typeof title !== "string" ||
    typeof description !== "string" ||
    typeof category !== "string" ||
    typeof impact !== "string" ||
    typeof urgency !== "string" ||
    title.trim().length === 0 ||
    description.trim().length === 0
  ) {
    // The <form> below marks these fields `required`, so a normal user
    // can't hit this in practice — this check exists because the browser
    // isn't the only thing that can send a POST here. Never trust that
    // client-side validation is the only line of defense.
    throw new Error("Title, description, category, impact and urgency are all required.");
  }

  // This is the ITIL logic from src/types/itil.ts actually being used:
  // the two independent judgement calls the requester made (Impact,
  // Urgency) get combined into the one number that drives everything
  // downstream — how it sorts in the queue, how urgently it gets
  // escalated, what SLA clock starts ticking.
  const priority = derivePriority(impact as Impact, urgency as Urgency);
  const { slaResponseDueAt, slaResolveDueAt } = calculateSlaDueDates(priority);

  // Human-readable ticket numbers (INC000001, INC000002, ...) are cosmetic
  // — the database's real primary key is the `id` field. Counting existing
  // rows to pick the next number is simple but not safe against two people
  // submitting at the exact same instant (both could count the same total
  // and pick the same number); a real production system would use a
  // database sequence instead. Fine for a single-user demo, worth knowing
  // the limitation.
  const existingCount = await prisma.incident.count();
  const ticketNumber = `INC${String(existingCount + 1).padStart(6, "0")}`;

  const incident = await prisma.incident.create({
    data: {
      ticketNumber,
      title: title.trim(),
      description: description.trim(),
      category: category as IncidentCategory,
      impact: impact as Impact,
      urgency: urgency as Urgency,
      priority,
      status: "NEW",
      requesterId: activeUser.id,
      slaResponseDueAt,
      slaResolveDueAt,
    },
  });

  await prisma.incidentActivity.create({
    data: {
      incidentId: incident.id,
      actorId: activeUser.id,
      type: "CREATED",
      message: `Incident logged by ${activeUser.name}.`,
    },
  });

  // Straight to the new ticket's own page, not back to the dashboard —
  // landing on a list you'd have to search through for the thing you
  // just created is exactly what made "where did my incident go" a real
  // point of confusion. This way, the answer to "where do I find it" is
  // just "you're looking at it."
  redirect(`/incidents/${incident.id}?created=1`);
}
