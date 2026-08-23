# ITIL Service Desk Simulator

**Live demo: [itil-service-desk.vercel.app](https://itil-service-desk.vercel.app/)** — sign in with one click via the "Quick demo sign-in" buttons on the login page to try it as a customer, an L1/L2/L3 agent, or a manager. (Every demo account uses the password `password123`, shown on the login page itself.)

A web-based IT Service Desk simulator that implements a real ITIL Incident Management workflow — ticket logging, priority calculation, SLA tracking, and L1/L2/L3 escalation — built as a portfolio project for IT/Service Management roles.

## Project Overview

This app simulates the day-to-day tool an IT service desk agent works in: logging incidents, prioritizing them by business impact and urgency, tracking them against SLA deadlines, and escalating them through support tiers until resolved. It's built with a real relational database and a typed data model, not mock/hardcoded data.

**Docs:** [`docs/BUILD_LOG.md`](docs/BUILD_LOG.md) is a stage-by-stage history of how this project was built and why.

## ITIL Framework Concepts Simulated

- **Incident Management** — the lifecycle of an unplanned service interruption, from `NEW` → `IN_PROGRESS` → (`ON_HOLD`) → `RESOLVED` → `CLOSED`.
- **Impact vs. Urgency vs. Priority** — Impact (how much of the business is affected) and Urgency (how fast it needs fixing) are captured independently and combined via a priority matrix to derive Priority (P1–P4). See `src/types/itil.ts`.
- **SLA (Service Level Agreement) tracking** — each priority level has a target response time and resolution time; every incident stores its own SLA due dates, calculated at creation. Response and Resolution are tracked as two separate promises, each with its own permanent breached/met verdict recorded the moment it's actually met (`respondedAt`/`slaResponseBreached` on first contact, `resolvedAt`/`slaResolveBreached` on resolution) rather than staying a countdown that goes stale once the moment has passed. A manager's dashboard surfaces a proactive **"SLA at risk"** view — tickets already breached, plus tickets in the last 20% of their SLA window regardless of priority (a P1 with 10 minutes left and a P4 with 10 hours left can both be "at risk" relative to their own window) — see `getSlaRisk` in `src/types/itil.ts`.
- **Support Tiers (L1 / L2 / L3) & Escalation** — incidents are assigned to Level 1 (service desk), Level 2 (technical support), or Level 3 (specialist/engineering) agents. Escalating a ticket always moves it UP a tier (never back to the customer) and hands it to that tier's queue rather than one named person — see `getNextTier` in `src/types/itil.ts`.
- **Role-scoped dashboards** — the home page is a different view depending on who's signed in: a customer sees only the tickets they reported, an agent sees their own claimed tickets plus their tier's unclaimed queue, and a manager sees everything. The `currentTier` field on each incident is what makes an unassigned, escalated ticket still routable to the right tier's queue.
- **Real authentication** — email/password accounts with bcrypt-hashed passwords and a signed session (JWT in an HttpOnly cookie, verified on every request — see `src/lib/session.ts`), not a cookie you could edit in devtools to become anyone. Self-registration always creates a Customer account; L1/L2/L3 and Manager accounts are provisioned internally, the same way a real IT department doesn't let anyone sign themselves up as a support agent.
- **Search & filter** — `/incidents` lets you search by text (ticket number, title, description) and filter by status/priority/category, still bounded by the same role visibility as the dashboard — an L1 agent searching can't surface a ticket they have no reason to see.
- **Resolve vs. Close as separate steps** — Resolving records the fix; Closing is a separate confirmation (by the requester or a manager) that the fix actually held. A `RESOLVED` ticket can't be closed by just anyone, and the SLA-breach flag is calculated and permanently recorded the moment a ticket is resolved.
- **Audit trail** — every status change, assignment, escalation, resolution, closure, and comment on an incident is recorded as an `IncidentActivity`, so a ticket's full history is visible on its detail page.
- **Simulated email notifications** — `/inbox` is what the service desk would have emailed you in a real deployment (no real email is ever sent). An agent gets notified the moment a ticket is assigned to them; a customer gets notified the first time their ticket is picked up, if it's escalated, resolved, or closed on their behalf; comments notify whoever's on the other side of the conversation. Deliberately not spammy — a ticket bouncing between agents after an escalation only notifies the customer once, on the actual first response, not every hand-off.

Problem Management and Change Management are intentionally out of scope for v1 — this project builds one ITIL process completely before expanding to others.

## Training Simulator

`/training` is a practice mode, separate from the real ticket queue: a "call" comes in — written the way a real caller actually talks, including some vagueness on purpose — you pick your first diagnostic step from a set of multiple-choice options, and immediately see whether that choice was right (with an explanation either way) followed by how the issue was actually resolved. Attempts are tracked per user (retrying is expected — the goal is getting it right eventually, not on the first try), so `/training` also shows a running score. See `prisma/schema.prisma` (`TrainingScenario` / `TrainingChoice` / `TrainingAttempt`) and `src/data/training-scenarios.ts` for the content.

## Tech Stack

- **Framework:** Next.js (App Router) + React Server Components
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **Database:** PostgreSQL (Prisma Postgres), accessed through **Prisma ORM** (v7, driver-adapter based)
- **Domain logic:** Strongly-typed ITIL rules in `src/types/itil.ts` (priority matrix, SLA policy), kept separate from the database schema

## Project Architecture / Directory Map

```
app/
  page.tsx                  # Home page — personal "my work" dashboard, role-scoped (requires sign-in)
  layout.tsx                 # Root HTML layout, header shows signed-in user + sign out, unread inbox badge
  login/page.tsx              # Sign-in form + one-click "quick demo sign-in" for each seeded role
  signup/page.tsx              # Customer self-registration
  inbox/page.tsx               # Simulated email notifications — viewing it marks everything read
  incidents/
    page.tsx                    # Search/browse every incident visible to your role, with filters
    new/page.tsx                 # "Log a new incident" form
    [id]/page.tsx                 # Ticket detail page — SLA panel, role-gated action forms, activity timeline
  training/
    page.tsx                     # Training Simulator home — every scenario + your score
    [id]/page.tsx                  # One "call": transcript, multiple-choice question, then the reveal
prisma/
  schema.prisma              # Database schema: User, Incident, IncidentActivity, Notification, Training* models
  seed.ts                     # Demo data: one hashed-password user per role, sample incidents, training scenarios
  migrations/                 # Versioned history of schema changes
src/
  lib/
    prisma.ts                  # Shared Prisma client instance (with the PostgreSQL driver adapter)
    session.ts                  # Signs/verifies the session JWT cookie -> current User
    password.ts                  # bcrypt hash/verify helpers
    demo-accounts.ts              # The shared password every seeded demo persona uses
    notifications.ts              # Builds a Notification-create operation for use inside a $transaction
  actions/
    auth.ts                     # Server Actions: login, signup, quick demo sign-in, logout
    incidents.ts                 # Server Action: create a new incident (derives priority + SLA dates)
    incident-workflow.ts          # Server Actions for the rest of the lifecycle: take, reassign,
                                    # escalate, hold/resume, resolve, close, comment — and the
                                    # notifications each of those fires
    training.ts                   # Server Action: record a training attempt
  components/
    login-form.tsx                # Client Component — inline error display via useActionState
    signup-form.tsx                # Same pattern, for self-registration
    incident-list.tsx               # Shared ticket-list rendering (used by the dashboard and search page)
  data/
    training-scenarios.ts          # Training Simulator content — call transcripts, choices, resolutions
  types/itil.ts                    # ITIL business rules: impact/urgency -> priority matrix, SLA targets,
                                     # escalation-tier logic, role/label lookups
```

## Local Quickstart Guide

Requirements: Node.js (v20+ recommended) and a PostgreSQL database — see [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for provisioning a free one on Prisma Postgres in a couple of minutes if you don't already have one.

```bash
# 1. Clone the repo
git clone https://github.com/romartdanganan/itil-service-desk.git
cd itil-service-desk

# 2. Install dependencies (this also runs `prisma generate` via postinstall)
npm install

# 3. Set up your local environment file, then fill in DATABASE_URL and
#    SESSION_SECRET (generate one with `openssl rand -base64 32`)
cp .env.example .env

# 4. Apply the schema to your database
npx prisma migrate deploy

# 5. Load demo data (users + sample incidents + training scenarios)
npx prisma db seed

# 6. Run the dev server
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000) and sign in — either create a customer account at `/signup`, or use one of the "Quick demo sign-in" buttons on `/login` (every seeded account shares the password `password123`).

To browse the database visually, run `npx prisma studio` and open the URL it prints.

## Deployment

Live at **[itil-service-desk.vercel.app](https://itil-service-desk.vercel.app/)** — deployed on **Vercel**, backed by **Prisma Postgres**. Requires both `DATABASE_URL` and `SESSION_SECRET` set as environment variables in the Vercel project (a session secret shared with local dev would let anyone who's seen this repo's history forge a production login — use a separately-generated one for production). See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for the full setup, including why SQLite (used earlier in development) doesn't work on a serverless host and a real cross-database bug the switch surfaced.

## Tests

The ITIL business rules (`src/types/itil.ts`) — the priority matrix, SLA windows, escalation-tier logic, and SLA risk classification — have a unit test suite in `src/types/itil.test.ts`, run with [Vitest](https://vitest.dev):

```bash
npm test          # run once
npm run test:watch # re-run on file changes
```

Workflow behavior (take/escalate/resolve/close, role visibility, tier routing) is currently verified manually against the real dev database rather than with automated integration tests — see the testing notes in `docs/BUILD_LOG.md` for how each feature was checked.
