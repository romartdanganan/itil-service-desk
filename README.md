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
- **Simulated incoming tickets** — a real support queue never sits empty; without something refilling it, a practice queue does. Any agent or manager can click **"🔄 Simulate new tickets arriving"** to inject a fresh batch of realistic tickets (`src/data/incident-templates.ts`, 18 templates across every category), each attributed to one of a small pool of fictional employees (`src/data/npc-employees.ts`) rather than the same one repeated name. New tickets always start at the L1 tier — matching real ITIL, and matching how they'd need to actually be escalated up by hand to reach L2/L3, not pre-placed there.
- **In-app guidance, not just docs** — each dashboard (customer, agent, manager) opens with a plain-language explanation of what that role is for and what to do next, with ITSM terms defined inline rather than assumed. The goal is that someone with zero prior ITSM vocabulary can open the app and understand what they're looking at without reading external documentation first.

This project builds one ITIL process completely before expanding to the next; all three core processes are now built (Incident, Problem, Change).

## Problem Management

`/problems` (agent and manager only, never customer-facing, since real Problem Management is an internal process) is where recurring or serious incidents get investigated at the root cause level instead of fixed one ticket at a time. Flag any incident as a new problem, or link it to one already being tracked, since many incidents can trace back to a single underlying cause. Investigation runs through its own status lifecycle, `NEW`, `INVESTIGATING`, `KNOWN_ERROR` (once a workaround is recorded), `RESOLVED` (once the root cause is found and permanently fixed), `CLOSED` (a manager-only governance step, since unlike an incident there is no customer confirmation to wait on). The real payoff shows up on the incident itself: once a linked problem becomes a Known Error, the incident page shows the documented workaround directly, and any agent already assigned to a linked, still-open incident gets notified the moment that workaround is recorded, so they can apply it instead of re-diagnosing something already understood. See `Problem` / `ProblemActivity` in `prisma/schema.prisma` and `src/actions/problem-workflow.ts` for the lifecycle logic.

## Change Management

`/changes` (agent and manager only, never customer-facing) is where a Problem's permanent fix actually gets delivered: a formal, planned modification, complete with an implementation plan, a required backout plan (what to do if it goes wrong), a planned window, and a risk level. Raise one standalone or straight from a resolved Problem (`?fromProblemId=`, auto-linked, shown on both the Change and the Problem it addresses). Three change types behave genuinely differently, not just as labels: `STANDARD` (routine, auto-approved at creation, no manager action needed), `NORMAL` (starts `REQUESTED`, needs a manager's approval before it can start), and `EMERGENCY` (can start implementation immediately from `REQUESTED`, no waiting, but still needs approval recorded retroactively before it can be marked complete, the real ITIL nuance behind an emergency change rather than just a priority label). Outcomes are tracked honestly: `COMPLETED` and `FAILED` are both real, distinct endings, since not every change succeeds, and a `backoutPlan` only means something if failure is an outcome that actually gets recorded. `CLOSED` is a manager-only governance step, same as Problem. See `Change` / `ChangeActivity` in `prisma/schema.prisma` and `src/actions/change-workflow.ts` for the lifecycle logic.

## Training Simulator

`/training` is a practice mode, separate from the real ticket queue: a "call" comes in — written the way a real caller actually talks, including some vagueness on purpose — you pick your first diagnostic step from a set of multiple-choice options, and immediately see whether that choice was right (with an explanation either way) followed by how the issue was actually resolved. Attempts are tracked per user (retrying is expected — the goal is getting it right eventually, not on the first try), so `/training` also shows a running score. 12 scenarios across every incident category (Network, Software, Hardware, Access, Account, Other) and all three difficulty levels, each teaching a distinct triage or security-awareness lesson — including one about pushing back on a senior executive pressuring for a policy exception, and one about recovering a lost authenticator instead of just disabling two-factor auth. See `prisma/schema.prisma` (`TrainingScenario` / `TrainingChoice` / `TrainingAttempt`) and `src/data/training-scenarios.ts` for the content.

**Written-response grading:** each call also has a second, different question after the multiple-choice reveal, not "what would you do" but "how would you explain it to the caller." That's graded by a real LLM (Google's Gemini API, chosen because it has a genuinely free tier) rather than matched against a fixed answer, since judging whether an explanation is clear and complete isn't a keyword-matching problem. The trainee gets a score out of 5 plus one specific thing that worked and one specific thing to improve. Optional, not a gate, "Next call" is always available either way. Set `GEMINI_API_KEY` in `.env` to enable it (see `.env.example`); every other part of the app runs fine without it. See `src/lib/grade-written-answer.ts` and the `WrittenResponse` model in `prisma/schema.prisma`.

**Shift Mode** (`/shift/[id]`) is the closer-to-an-actual-job version: start a shift from `/training` and get 5 calls queued back-to-back, with **no retries once you answer** — a real shift doesn't let you rewind a call that already happened, and that one-shot pressure is the whole point versus freeform practice. Ends in a summary (score, time taken, a per-call breakdown linking back to each scenario to review afterward). See `Shift` in `prisma/schema.prisma`. (Written-response grading is freeform-practice only for now, not part of Shift Mode's fast pace.)

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
  problems/                     # Agent/manager only, never customer-facing
    page.tsx                    # Search/browse every problem, plus an "unowned" queue
    new/page.tsx                 # "Log a new problem" form, optionally pre-filled from a source incident
    [id]/page.tsx                 # Problem detail page, lifecycle actions, linked incidents/changes, activity timeline
  changes/                      # Agent/manager only, never customer-facing
    page.tsx                    # Search/browse every change, plus an "awaiting approval" queue
    new/page.tsx                 # "Log a new change" form, optionally pre-filled from a source problem
    [id]/page.tsx                 # Change detail page, lifecycle actions, activity timeline
  training/
    page.tsx                     # Training Simulator home — every scenario + your score + "Start a shift"
    [id]/page.tsx                  # One "call": transcript, multiple-choice question, then the reveal
  shift/
    [id]/page.tsx                  # Shift Mode: 5 calls back-to-back, no retries, ends in a summary
prisma/
  schema.prisma              # Database schema: User, Incident, IncidentActivity, Problem, ProblemActivity,
                               # Change, ChangeActivity, Notification, Shift, Training* models
  seed.ts                     # Demo data: one hashed-password user per role, sample incidents, training scenarios
  migrations/                 # Versioned history of schema changes
src/
  lib/
    prisma.ts                  # Shared Prisma client instance (with the PostgreSQL driver adapter)
    session.ts                  # Signs/verifies the session JWT cookie -> current User
    password.ts                  # bcrypt hash/verify helpers
    demo-accounts.ts              # The shared password every seeded demo persona uses
    notifications.ts              # Builds a Notification-create operation for use inside a $transaction
    random.ts                     # Shared Fisher-Yates shuffle (Shift Mode + the ticket generator)
    grade-written-answer.ts        # Grades a written training answer via the Gemini API
  actions/
    auth.ts                     # Server Actions: login, signup, quick demo sign-in, logout
    incidents.ts                 # Server Action: create a new incident (derives priority + SLA dates)
    incident-workflow.ts          # Server Actions for the rest of the lifecycle: take, reassign,
                                    # escalate, hold/resume, resolve, close, comment — and the
                                    # notifications each of those fires
    problems.ts                   # Server Actions: raise a new problem (optionally from a source
                                    # incident), link an existing incident to an existing problem
    problem-workflow.ts            # Server Actions for the problem lifecycle: take, reassign, record
                                     # a workaround, resolve, close, comment
    changes.ts                    # Server Action: raise a new change (optionally from a source problem)
    change-workflow.ts             # Server Actions for the change lifecycle: approve, reject, start,
                                     # complete, fail, close, comment
    training.ts                   # Server Actions: record a freeform training attempt, grade a
                                    # written-response follow-up answer
    shift.ts                      # Server Actions: start a shift, answer the current call in one
    generate-tickets.ts            # Server Action: simulate a fresh batch of incoming tickets
  components/
    login-form.tsx                # Client Component — inline error display via useActionState
    signup-form.tsx                # Same pattern, for self-registration
    incident-list.tsx               # Shared ticket-list rendering (used by the dashboard and search page)
    problem-list.tsx                # Shared problem-list rendering (used by the /problems search page)
    change-list.tsx                 # Shared change-list rendering (used by /changes and the Problem page)
    training-call.tsx               # Shared call/question/reveal UI (used by freeform practice and Shift Mode)
    written-response-step.tsx        # The graded written-answer step, freeform practice only
  data/
    training-scenarios.ts          # Training Simulator content — call transcripts, choices, resolutions
    incident-templates.ts           # "Incoming tickets" content bank — realistic titles/descriptions
    npc-employees.ts                # Fictional employee pool generated tickets are attributed to
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
#    SESSION_SECRET (generate one with `openssl rand -base64 32`).
#    GEMINI_API_KEY is optional, only needed for written-response grading
#    in the Training Simulator, get a free one at aistudio.google.com.
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

Live at **[itil-service-desk.vercel.app](https://itil-service-desk.vercel.app/)** — deployed on **Vercel**, backed by **Prisma Postgres**. Requires `DATABASE_URL` and `SESSION_SECRET` set as environment variables in the Vercel project (a session secret shared with local dev would let anyone who's seen this repo's history forge a production login — use a separately-generated one for production), plus `GEMINI_API_KEY` for written-response grading to work on the live demo. See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for the full setup, including why SQLite (used earlier in development) doesn't work on a serverless host and a real cross-database bug the switch surfaced.

## Tests

The ITIL business rules (`src/types/itil.ts`) — the priority matrix, SLA windows, escalation-tier logic, and SLA risk classification — have a unit test suite in `src/types/itil.test.ts`, run with [Vitest](https://vitest.dev):

```bash
npm test          # run once
npm run test:watch # re-run on file changes
```

Workflow behavior (take/escalate/resolve/close, role visibility, tier routing) is currently verified manually against the real dev database rather than with automated integration tests — see the testing notes in `docs/BUILD_LOG.md` for how each feature was checked.
