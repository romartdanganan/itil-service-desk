import { PrismaClient, Impact, Urgency, IncidentCategory, ActivityType } from "../app/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { derivePriority, calculateSlaDueDates } from "../src/types/itil";

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL ?? "file:./dev.db",
});
const prisma = new PrismaClient({ adapter });

async function main() {
  // Seed data lets us build and demo the UI without manually clicking
  // through "create ticket" forms every time we restart the database.
  // One user per role so the role-switcher has something to switch between.
  const [customer, l1, l2, l3, manager] = await Promise.all([
    prisma.user.create({
      data: { name: "Alex Rivera", email: "alex.rivera@example.com", role: "CUSTOMER" },
    }),
    prisma.user.create({
      data: { name: "Jordan Lee", email: "jordan.lee@helpdesk.example.com", role: "AGENT_L1" },
    }),
    prisma.user.create({
      data: { name: "Sam Patel", email: "sam.patel@helpdesk.example.com", role: "AGENT_L2" },
    }),
    prisma.user.create({
      data: { name: "Casey Kim", email: "casey.kim@helpdesk.example.com", role: "AGENT_L3" },
    }),
    prisma.user.create({
      data: { name: "Morgan Diaz", email: "morgan.diaz@helpdesk.example.com", role: "MANAGER" },
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
  }

  console.log("Seed complete:", {
    users: 5,
    incidents: samples.length,
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
