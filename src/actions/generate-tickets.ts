"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/src/lib/prisma";
import { getActiveUser } from "@/src/lib/session";
import { isAgentRole, derivePriority, calculateSlaDueDates } from "@/src/types/itil";
import { shuffled } from "@/src/lib/random";
import { INCIDENT_TEMPLATES } from "@/src/data/incident-templates";
import { NPC_EMPLOYEES } from "@/src/data/npc-employees";

const TICKETS_PER_BATCH = 4;

/**
 * Simulate a fresh batch of tickets arriving — what actually makes this
 * app feel like an ongoing job rather than a demo that runs dry after a
 * few tries. Real support queues never sit empty; without something
 * refilling it, an agent's dashboard eventually has nothing left to
 * practice on.
 *
 * Agent/manager only — this represents new problems showing up in the
 * queue, not something a customer would trigger on themselves.
 */
export async function generateIncomingTickets() {
  const activeUser = await getActiveUser();
  if (!activeUser) {
    redirect("/login");
  }
  if (!isAgentRole(activeUser.role)) {
    throw new Error("Only agents and managers can simulate incoming tickets.");
  }

  const npcRequesters = await prisma.user.findMany({
    where: { email: { in: NPC_EMPLOYEES.map((e) => e.email) } },
  });
  if (npcRequesters.length === 0) {
    throw new Error(
      "No NPC customer accounts found — run `npx prisma db seed` to create them.",
    );
  }

  const templates = shuffled(INCIDENT_TEMPLATES).slice(0, TICKETS_PER_BATCH);
  // Counting once up front and incrementing locally (rather than
  // re-counting before every insert) has the same known limitation as
  // createIncident()'s ticket numbering: two of these batches running at
  // the exact same instant could in principle collide. Fine at this
  // app's demo scale, same accepted tradeoff as everywhere else this
  // pattern is used.
  const existingCount = await prisma.incident.count();

  for (let i = 0; i < templates.length; i++) {
    const template = templates[i];
    const requester = npcRequesters[Math.floor(Math.random() * npcRequesters.length)];
    const priority = derivePriority(template.impact, template.urgency);
    const { slaResponseDueAt, slaResolveDueAt } = calculateSlaDueDates(priority);
    const ticketNumber = `INC${String(existingCount + i + 1).padStart(6, "0")}`;

    const incident = await prisma.incident.create({
      data: {
        ticketNumber,
        title: template.title,
        description: template.description,
        category: template.category,
        impact: template.impact,
        urgency: template.urgency,
        priority,
        status: "NEW",
        requesterId: requester.id,
        slaResponseDueAt,
        slaResolveDueAt,
      },
    });

    await prisma.incidentActivity.create({
      data: {
        incidentId: incident.id,
        actorId: requester.id,
        type: "CREATED",
        message: `Incident logged by ${requester.name}.`,
      },
    });
  }

  revalidatePath("/");
  revalidatePath("/incidents");
  redirect("/");
}
