"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/src/lib/prisma";
import { getActiveUser } from "@/src/lib/session";
import { getDemoSessionId } from "@/src/lib/demo-session";
import { nextSequentialNumber } from "@/src/lib/sequential-number";
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

  // Stamped on the whole batch: "simulate new tickets" becomes part of
  // the clicking visitor's own sandbox, not a shared pile every other
  // visitor also sees, same as anything else they create by hand.
  const demoSessionId = await getDemoSessionId();

  const templates = shuffled(INCIDENT_TEMPLATES).slice(0, TICKETS_PER_BATCH);
  // Read once up front and incremented locally per item in the loop
  // (rather than re-querying before every insert), see
  // src/lib/sequential-number.ts for why this is max-based, not
  // count-based.
  const lastIncident = await prisma.incident.findFirst({
    orderBy: { ticketNumber: "desc" },
    select: { ticketNumber: true },
  });
  let lastTicketNumber = lastIncident?.ticketNumber ?? null;

  for (let i = 0; i < templates.length; i++) {
    const template = templates[i];
    const requester = npcRequesters[Math.floor(Math.random() * npcRequesters.length)];
    const priority = derivePriority(template.impact, template.urgency);
    const { slaResponseDueAt, slaResolveDueAt } = calculateSlaDueDates(priority);
    const ticketNumber = nextSequentialNumber(lastTicketNumber, "INC");
    lastTicketNumber = ticketNumber;

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
        demoSessionId,
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
