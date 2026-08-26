import { PrismaClient, Impact, Urgency, IncidentCategory, ActivityType } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { derivePriority, calculateSlaDueDates } from "../src/types/itil";
import { TRAINING_SCENARIOS } from "../src/data/training-scenarios";
import { NPC_EMPLOYEES } from "../src/data/npc-employees";
import { hashPassword } from "../src/lib/password";
import { DEMO_PASSWORD } from "../src/lib/demo-accounts";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  // Seed data lets us build and demo the UI without manually clicking
  // through "create ticket" forms every time we restart the database.
  // One user per role, each a real account (real password hash) marked
  // `isDemoAccount: true` so the login page's "quick sign in" buttons can
  // find exactly these five and no one else.
  const demoPasswordHash = await hashPassword(DEMO_PASSWORD);
  const [customer, l1, l2, l3, manager] = await Promise.all([
    prisma.user.create({
      data: {
        name: "Alex Rivera",
        email: "alex.rivera@example.com",
        role: "CUSTOMER",
        passwordHash: demoPasswordHash,
        isDemoAccount: true,
      },
    }),
    prisma.user.create({
      data: {
        name: "Jordan Lee",
        email: "jordan.lee@helpdesk.example.com",
        role: "AGENT_L1",
        passwordHash: demoPasswordHash,
        isDemoAccount: true,
      },
    }),
    prisma.user.create({
      data: {
        name: "Sam Patel",
        email: "sam.patel@helpdesk.example.com",
        role: "AGENT_L2",
        passwordHash: demoPasswordHash,
        isDemoAccount: true,
      },
    }),
    prisma.user.create({
      data: {
        name: "Casey Kim",
        email: "casey.kim@helpdesk.example.com",
        role: "AGENT_L3",
        passwordHash: demoPasswordHash,
        isDemoAccount: true,
      },
    }),
    prisma.user.create({
      data: {
        name: "Morgan Diaz",
        email: "morgan.diaz@helpdesk.example.com",
        role: "MANAGER",
        passwordHash: demoPasswordHash,
        isDemoAccount: true,
      },
    }),
  ]);

  const samples: {
    title: string;
    description: string;
    category: IncidentCategory;
    impact: Impact;
    urgency: Urgency;
    assignee: typeof l1;
  }[] = [
    {
      title: "Card payment terminals down store-wide",
      description:
        "All POS terminals at the downtown branch are showing 'connection lost'. No card payments possible, cash only.",
      category: "NETWORK",
      impact: "HIGH",
      urgency: "HIGH",
      assignee: l3,
    },
    {
      title: "Cannot access shared drive",
      description: "Getting 'access denied' when opening \\\\fileserver\\team-share since this morning.",
      category: "ACCESS",
      impact: "MEDIUM",
      urgency: "MEDIUM",
      assignee: l1,
    },
    {
      title: "Laptop won't power on",
      description: "Pressed power button, no lights, no fan noise. Tried a different outlet.",
      category: "HARDWARE",
      impact: "LOW",
      urgency: "MEDIUM",
      assignee: l1,
    },
  ];

  let ticketCounter = 1;
  const seededIncidents: { id: string; ticketNumber: string; title: string }[] = [];

  for (const sample of samples) {
    const priority = derivePriority(sample.impact, sample.urgency);
    const { slaResponseDueAt, slaResolveDueAt } = calculateSlaDueDates(priority);

    const incident = await prisma.incident.create({
      data: {
        ticketNumber: `INC${String(ticketCounter++).padStart(6, "0")}`,
        title: sample.title,
        description: sample.description,
        category: sample.category,
        impact: sample.impact,
        urgency: sample.urgency,
        priority,
        status: "NEW",
        requesterId: customer.id,
        assigneeId: sample.assignee.id,
        currentTier: sample.assignee.role,
        slaResponseDueAt,
        // Seeded tickets are created pre-assigned (bypassing the normal
        // takeIncident flow), so first response is backfilled here too —
        // otherwise these demo tickets would sit with no response verdict
        // despite already having an assignee.
        respondedAt: new Date(),
        slaResolveDueAt,
      },
    });

    await prisma.incidentActivity.create({
      data: {
        incidentId: incident.id,
        actorId: customer.id,
        type: ActivityType.CREATED,
        message: `Incident logged by ${customer.name}.`,
      },
    });

    await prisma.incidentActivity.create({
      data: {
        incidentId: incident.id,
        actorId: manager.id,
        type: ActivityType.ASSIGNED,
        message: `Assigned to ${sample.assignee.name}.`,
      },
    });

    seededIncidents.push({ id: incident.id, ticketNumber: incident.ticketNumber, title: incident.title });
  }

  // One worked example each for Problem and Change Management, so a
  // first-time visitor (or a fresh `npm run db seed`) sees what a real
  // record actually looks like instead of an empty list with nothing to
  // learn from. Deliberately walked through to completion, a Known
  // Error with its workaround, and a Change all the way to Completed,
  // rather than left half-finished, the same "give every seeded persona
  // genuinely distinct, realistic work" instinct already used for the
  // incidents above.
  const paymentTerminalsIncident = seededIncidents.find((i) =>
    i.title.includes("Card payment terminals"),
  )!;

  const problem = await prisma.problem.create({
    data: {
      problemNumber: "PRB000001",
      title: "Recurring POS terminal connectivity drops",
      description:
        "Card payment terminals at the downtown branch have lost connection twice this month, both times store-wide, both times during peak hours.",
      category: "NETWORK",
      impact: "HIGH",
      urgency: "HIGH",
      priority: derivePriority("HIGH", "HIGH"),
      status: "KNOWN_ERROR",
      ownerId: l3.id,
      raisedById: l3.id,
      workaround:
        "Power-cycle the in-store network switch, terminals reconnect automatically within about 2 minutes. Store staff have a laminated card with these steps at the register.",
      workaroundAt: new Date(),
    },
  });

  await prisma.incident.update({
    where: { id: paymentTerminalsIncident.id },
    data: { problemId: problem.id },
  });

  await prisma.problemActivity.createMany({
    data: [
      { problemId: problem.id, actorId: l3.id, type: "CREATED", message: `Problem raised by ${l3.name}.` },
      {
        problemId: problem.id,
        actorId: l3.id,
        type: "INCIDENT_LINKED",
        message: `Linked to incident ${paymentTerminalsIncident.ticketNumber}: ${paymentTerminalsIncident.title}.`,
      },
      { problemId: problem.id, actorId: l3.id, type: "ASSIGNED", message: `${l3.name} took this problem and started investigating.` },
      {
        problemId: problem.id,
        actorId: l3.id,
        type: "WORKAROUND_RECORDED",
        message: `${l3.name} recorded a workaround; this problem is now a Known Error.`,
      },
    ],
  });

  await prisma.incidentActivity.create({
    data: {
      incidentId: paymentTerminalsIncident.id,
      actorId: l3.id,
      type: "PROBLEM_LINKED",
      message: `${l3.name} linked this incident to problem ${problem.problemNumber}.`,
    },
  });

  const changePlannedStart = new Date();
  changePlannedStart.setDate(changePlannedStart.getDate() - 3);
  const changePlannedEnd = new Date(changePlannedStart);
  changePlannedEnd.setHours(changePlannedEnd.getHours() + 1);

  const change = await prisma.change.create({
    data: {
      changeNumber: "CHG000001",
      title: "Replace downtown branch network switch",
      description:
        "The in-store switch that keeps dropping POS terminal connections is being swapped for a spare unit, rather than continuing to rely on the power-cycle workaround.",
      category: "NETWORK",
      changeType: "NORMAL",
      risk: "MEDIUM",
      implementationPlan:
        "Swap the switch during the branch's closed hours, reconnect all terminal uplinks, confirm each register can process a test transaction before reopening.",
      backoutPlan:
        "Reconnect the original switch and fall back to the documented power-cycle workaround if the replacement doesn't resolve connectivity within the maintenance window.",
      plannedStart: changePlannedStart,
      plannedEnd: changePlannedEnd,
      status: "COMPLETED",
      requestedById: l3.id,
      approvedById: manager.id,
      approvalNotes: "Approved, closed hours only, keep the old switch on hand in case of a rollback.",
      implementedById: l3.id,
      postImplementationNotes:
        "Switch replaced without issue, all terminals reconnected and processed test transactions successfully. No drops since.",
      completedAt: new Date(),
      sourceProblemId: problem.id,
    },
  });

  await prisma.changeActivity.createMany({
    data: [
      { changeId: change.id, actorId: l3.id, type: "CREATED", message: `${l3.name} raised this change for approval.` },
      { changeId: change.id, actorId: manager.id, type: "APPROVED", message: `${manager.name} approved this change.` },
      { changeId: change.id, actorId: l3.id, type: "STARTED", message: `${l3.name} started implementing this change.` },
      { changeId: change.id, actorId: l3.id, type: "COMPLETED", message: `${l3.name} completed this change.` },
    ],
  });

  // Two worked Service Request examples, same "give a first-time visitor
  // something real to look at, not an empty list" reasoning as the
  // Problem/Change examples above. One walked all the way through a
  // STANDARD (pre-approved) request's lifecycle; one left sitting in
  // PENDING_APPROVAL, so the Manager's "Awaiting approval" queue, the
  // real ITIL distinction this feature exists to teach, isn't empty on a
  // fresh seed either.
  const passwordReset = await prisma.serviceRequest.create({
    data: {
      requestNumber: "SR000001",
      title: "Password reset",
      description: "I'm locked out of my account and need my password reset.",
      category: "ACCOUNT",
      requestType: "STANDARD",
      status: "CLOSED",
      requesterId: customer.id,
      fulfillerId: l1.id,
      fulfillmentNotes: "Reset the password and had the user set a new one on next login.",
      fulfilledAt: new Date(),
      closedAt: new Date(),
    },
  });

  await prisma.serviceRequestActivity.createMany({
    data: [
      {
        serviceRequestId: passwordReset.id,
        actorId: customer.id,
        type: "SUBMITTED",
        message: `${customer.name} submitted this request. Pre-approved, ready for fulfillment.`,
      },
      {
        serviceRequestId: passwordReset.id,
        actorId: l1.id,
        type: "ASSIGNED",
        message: `${l1.name} took this request and started fulfilling it.`,
      },
      {
        serviceRequestId: passwordReset.id,
        actorId: l1.id,
        type: "FULFILLED",
        message: `${l1.name} fulfilled this request.`,
      },
      {
        serviceRequestId: passwordReset.id,
        actorId: customer.id,
        type: "CLOSED",
        message: `${customer.name} confirmed this request and closed it.`,
      },
    ],
  });

  const newLaptop = await prisma.serviceRequest.create({
    data: {
      requestNumber: "SR000002",
      title: "New starter laptop",
      description: "A new starter needs a laptop set up before their start date.",
      category: "HARDWARE",
      requestType: "APPROVAL_REQUIRED",
      status: "PENDING_APPROVAL",
      requesterId: customer.id,
    },
  });

  await prisma.serviceRequestActivity.create({
    data: {
      serviceRequestId: newLaptop.id,
      actorId: customer.id,
      type: "SUBMITTED",
      message: `${customer.name} submitted this request for manager approval.`,
    },
  });

  // One worked Knowledge Base example, published and written up from the
  // Problem seeded above, same "give a fresh sign-in something real to
  // look at" reasoning as the Problem/Change/Service Request examples.
  // Plus one left as a DRAFT, so the "awaiting publish" queue on a fresh
  // seed isn't empty either, the real distinction this feature exists to
  // teach (a draft isn't searchable or linkable yet).
  const posArticle = await prisma.knowledgeArticle.create({
    data: {
      articleNumber: "KB000001",
      title: "POS terminals losing connection store-wide",
      category: "NETWORK",
      symptoms:
        "All card payment terminals at a branch show 'connection lost' at the same time, usually during peak hours. Cash payments still work.",
      solution:
        "Power-cycle the in-store network switch. Terminals reconnect automatically within about 2 minutes. A permanent fix (switch replacement) may already be scheduled or complete, check the linked problem for the current status before applying the workaround.",
      status: "PUBLISHED",
      authorId: l3.id,
      sourceProblemId: problem.id,
    },
  });

  await prisma.knowledgeArticleActivity.createMany({
    data: [
      {
        articleId: posArticle.id,
        actorId: l3.id,
        type: "CREATED",
        message: `${l3.name} wrote this article up from problem ${problem.problemNumber}.`,
      },
      { articleId: posArticle.id, actorId: l3.id, type: "PUBLISHED", message: `${l3.name} published this article.` },
    ],
  });

  const vpnDraft = await prisma.knowledgeArticle.create({
    data: {
      articleNumber: "KB000002",
      title: "Requesting VPN access for remote work",
      category: "ACCESS",
      symptoms:
        "A remote employee asks how to get VPN access set up, or says they can't reach internal systems from home.",
      solution:
        "Confirm the request is coming through an approved Service Request (VPN access needs manager sign-off), then provision the account and send the client setup guide.",
      status: "DRAFT",
      authorId: l1.id,
    },
  });

  await prisma.knowledgeArticleActivity.create({
    data: {
      articleId: vpnDraft.id,
      actorId: l1.id,
      type: "CREATED",
      message: `${l1.name} wrote this article as a draft.`,
    },
  });

  // NPC customer pool for the "simulate incoming tickets" generator —
  // real accounts (nobody logs into them, but the requesterId foreign
  // key needs a real User row), reusing the demo password hash since
  // there's nothing sensitive to protect on an account nobody signs
  // into and that never appears in the quick-sign-in list.
  await prisma.user.createMany({
    data: NPC_EMPLOYEES.map((employee) => ({
      name: employee.name,
      email: employee.email,
      role: "CUSTOMER",
      passwordHash: demoPasswordHash,
      isDemoAccount: false,
    })),
  });

  for (const scenario of TRAINING_SCENARIOS) {
    await prisma.trainingScenario.create({
      data: {
        title: scenario.title,
        category: scenario.category,
        difficulty: scenario.difficulty,
        channel: scenario.channel,
        channelSubject: scenario.channelSubject,
        callerOpening: scenario.callerOpening,
        callerFollowUp: scenario.callerFollowUp,
        question: scenario.question,
        resolutionSteps: scenario.resolutionSteps,
        writtenPrompt: scenario.writtenPrompt,
        choices: {
          create: scenario.choices.map((choice, index) => ({
            text: choice.text,
            isCorrect: choice.isCorrect,
            explanation: choice.explanation,
            order: index,
          })),
        },
      },
    });
  }

  console.log("Seed complete:", {
    users: 5 + NPC_EMPLOYEES.length,
    incidents: samples.length,
    problems: 1,
    changes: 1,
    serviceRequests: 2,
    knowledgeArticles: 2,
    trainingScenarios: TRAINING_SCENARIOS.length,
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
