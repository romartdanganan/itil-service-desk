# ITIL Service Desk Simulator

A web-based IT Service Desk simulator that implements a real ITIL Incident Management workflow — ticket logging, priority calculation, SLA tracking, and L1/L2/L3 escalation — built as a portfolio project for IT/Service Management roles.

## Project Overview

This app simulates the day-to-day tool an IT service desk agent works in: logging incidents, prioritizing them by business impact and urgency, tracking them against SLA deadlines, and escalating them through support tiers until resolved. It's built with a real relational database and a typed data model, not mock/hardcoded data.

## ITIL Framework Concepts Simulated

- **Incident Management** — the lifecycle of an unplanned service interruption, from `NEW` → `IN_PROGRESS` → (`ON_HOLD`) → `RESOLVED` → `CLOSED`.
- **Impact vs. Urgency vs. Priority** — Impact (how much of the business is affected) and Urgency (how fast it needs fixing) are captured independently and combined via a priority matrix to derive Priority (P1–P4). See `src/types/itil.ts`.
- **SLA (Service Level Agreement) tracking** — each priority level has a target response time and resolution time; every incident stores its own SLA due dates, calculated at creation.
- **Support Tiers (L1 / L2 / L3) & Escalation** — incidents are assigned to Level 1 (service desk), Level 2 (technical support), or Level 3 (specialist/engineering) agents. Escalating a ticket always moves it UP a tier (never back to the customer) and hands it to that tier's queue rather than one named person — see `getNextTier` in `src/types/itil.ts`.
- **Resolve vs. Close as separate steps** — Resolving records the fix; Closing is a separate confirmation (by the requester or a manager) that the fix actually held. A `RESOLVED` ticket can't be closed by just anyone, and the SLA-breach flag is calculated and permanently recorded the moment a ticket is resolved.
- **Audit trail** — every status change, assignment, escalation, resolution, closure, and comment on an incident is recorded as an `IncidentActivity`, so a ticket's full history is visible on its detail page.

Problem Management and Change Management are intentionally out of scope for v1 — this project builds one ITIL process completely before expanding to others.

## Tech Stack

- **Framework:** Next.js (App Router) + React Server Components
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **Database:** SQLite, accessed through **Prisma ORM** (v7, driver-adapter based)
- **Domain logic:** Strongly-typed ITIL rules in `src/types/itil.ts` (priority matrix, SLA policy), kept separate from the database schema

## Project Architecture / Directory Map

```
app/
  page.tsx                  # Home page — ticket list, Server Component queries incidents directly
  layout.tsx                 # Root HTML layout, includes the role-switcher header
  incidents/
    new/page.tsx              # "Log a new incident" form
    [id]/page.tsx              # Ticket detail page — SLA panel, role-gated action forms, activity timeline
prisma/
  schema.prisma              # Database schema: User, Incident, IncidentActivity models + ITIL enums
  seed.ts                     # Demo data: one user per role, sample incidents
  migrations/                 # Versioned history of schema changes
src/
  lib/
    prisma.ts                  # Shared Prisma client instance (with SQLite driver adapter)
    session.ts                  # Reads the "acting as" cookie -> current User (the v1 stand-in for auth)
  actions/
    session.ts                  # Server Action: switch the active "logged in" user
    incidents.ts                 # Server Action: create a new incident (derives priority + SLA dates)
    incident-workflow.ts          # Server Actions for the rest of the lifecycle: take, reassign,
                                    # escalate, hold/resume, resolve, close, comment
  components/
    role-switcher.tsx            # Client Component — the "Viewing as" dropdown in the header
  types/itil.ts                  # ITIL business rules: impact/urgency -> priority matrix, SLA targets,
                                   # escalation-tier logic, role/label lookups
```

## Local Quickstart Guide

Requirements: Node.js (v20+ recommended).

```bash
# 1. Clone the repo
git clone https://github.com/romartdanganan/itil-service-desk.git
cd itil-service-desk

# 2. Install dependencies
npm install

# 3. Set up your local environment file
cp .env.example .env

# 4. Create the local SQLite database and apply the schema
npx prisma migrate dev

# 5. Load demo data (users + sample incidents)
npx prisma db seed

# 6. Run the dev server
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

To browse the database visually, run `npx prisma studio` and open the URL it prints.
