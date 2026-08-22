# Build Log

A stage-by-stage record of how this project was actually built: what was
created first, in what order, why each piece exists, and what tool built
it. This is a working document — it gets a new entry each time a
meaningful stage of the project is completed, so it should always reflect
the real history in `git log`, not a cleaned-up retelling.

## How this project is being built

Built with **Claude Code** (Anthropic's terminal-based AI coding agent)
acting as a 1-on-1 mentor/pair-programmer, not an autopilot — every
architectural choice below was either explained before it was built or
presented as a real tradeoff to choose between. The working pattern for
every stage has been the same:

1. Build one complete, working slice of functionality (not a partial
   sketch of many features).
2. Type-check it (`npx tsc --noEmit`).
3. Actually run it — start the dev server, exercise the real feature
   against the real SQLite database, and confirm the output is correct
   (not just "it compiles").
4. Update `README.md` so the repo stays self-explanatory to a stranger.
5. Commit with a message explaining *why*, then push to GitHub, so the
   remote repo is never more than one feature behind.

That commit-per-feature discipline is why `git log` on this repo doubles
as a second copy of this history, in more technical language.

## Stage 0 — Scoping the project (2026-08-22)

Before any code, three scope questions were decided up front, framed as a
learning-speed vs. completeness vs. resume-polish tradeoff:

- **Data layer:** a real database (SQLite) through a real ORM (Prisma)
  from day one — not in-memory/mock data — so there'd be no "throwaway
  prototype" phase to redo later, and so the project demonstrates real
  data-modeling skill.
- **Feature scope:** build **Incident Management only**, but build it
  *completely*, end-to-end (log → categorize/prioritize → assign to
  L1/L2/L3 → SLA timer → resolve → close) rather than sketching three
  ITIL processes (Incident, Problem, Change) shallowly. Problem
  Management and Change Management are deliberately v2, not started.
- **Auth:** no real login system for v1. A "role switcher" (pick which
  seeded user you're acting as) stands in for authentication, so the app
  can demonstrate role-based permissions (customer vs. L1 vs. L2 vs. L3
  vs. manager) without spending a stage building NextAuth/session
  infrastructure that isn't the point of the project.

**Why this matters for the story:** this was a deliberate scope
decision, not a shortcut taken by accident — worth saying explicitly if
asked "why isn't there real login."

## Stage 1 — Project scaffold (`dfae712`)

Next.js (App Router) + TypeScript + Tailwind CSS project created, plus a
first pass at the ITIL domain types. This is the "empty house with the
foundation poured" commit — no database yet, no real pages yet.

## Stage 2 — `.gitignore` cleanup (`19f7c64`)

Housekeeping: made sure local dev config files don't get committed.

## Stage 3 — Database layer: Prisma + SQLite (`c64dc8c`)

This is where the project got a real backend. Built in this stage:

- `prisma/schema.prisma` — the `User`, `Incident`, and `IncidentActivity`
  models, plus every ITIL enum (`Role`, `IncidentCategory`, `Impact`,
  `Urgency`, `Priority`, `IncidentStatus`, `ActivityType`).
- `src/types/itil.ts` — the ITIL **business rules**, kept deliberately
  separate from the schema: the Impact × Urgency → Priority matrix, the
  SLA response/resolve time targets per priority, and support-tier
  ordering. The split matters: the schema defines what shape a ticket
  has, this file defines how the business decides its values — and
  business policy (e.g. "P1 gets a 15-minute response SLA") changes far
  more often than database structure does.
- `prisma/seed.ts` — demo data: one user per role, a handful of sample
  incidents, so the app has something to look at without manually
  clicking through the "create ticket" form every time the database
  resets.
- The home page became a real Server Component querying the database
  directly, replacing the default Next.js starter page.

**A real obstacle hit here, worth mentioning in an interview:** the
installed Prisma version (7.9.1) turned out to have meaningfully
different APIs than the "standard" Prisma most tutorials/training data
describe — driver adapters became *mandatory* even for SQLite (a plain
`new PrismaClient()` throws at runtime), the client generator and its
output shape changed, and configuration moved out of `.env`-only into a
`prisma.config.ts` file. This got debugged by reading the actual
generated output and real error messages instead of trusting
half-remembered Prisma knowledge — the same "verify against what's
actually installed, not what you assume" instinct that matters on any
real team working with fast-moving dependencies.

## Stage 4 — README pass 1 (`0d2be12`)

Documented the ITIL concepts, tech stack, and quickstart so the repo is
readable by someone who just cloned it.

## Stage 5 — Tooling cleanup (`05d2dfb`)

Stopped tracking local-only tooling files that shouldn't be in version
control.

## Stage 6 — Role-switcher and incident logging (`f8f7bef`)

The first *interactive* feature — this is where the app stopped being
read-only.

- `src/lib/session.ts` + `src/actions/session.ts` — a cookie holds "who
  am I acting as right now"; this cookie *is* the entire session
  mechanism for v1 (see the Stage 0 auth decision).
- `src/components/role-switcher.tsx` — the "Viewing as" dropdown in the
  header. This is the project's first **Client Component** (needs
  `onChange` in the browser), everything before it was a **Server
  Component** (runs only on the server, ships no JS for it to the
  browser).
- `app/incidents/new/page.tsx` + `src/actions/incidents.ts` — the "log a
  new incident" form, submitting straight to a **Server Action**
  (`createIncident`) instead of a hand-built API route + `fetch()` call.
  Priority and SLA due dates are computed server-side at creation time
  using the Stage 3 business rules.
- **A real bug fixed here:** `src/types/itil.ts` was importing enums from
  the full Prisma client entry point instead of its dependency-free
  `enums` module, which would have dragged Node-only code (eventually the
  native SQLite binding) into the browser bundle of any Client Component
  that imported it. Fixed by importing from the lightweight module
  instead. Small, but the kind of bug that's invisible until a bundler
  analysis or a runtime browser error catches it.

## Stage 7 — The rest of the incident lifecycle (`86aabd1`)

Everything after "a ticket exists": the ticket detail page and every
workflow action.

- `app/incidents/[id]/page.tsx` — full ticket detail: an SLA panel
  showing time remaining or "overdue by Xh Ym", resolution notes,
  role-gated action buttons, and the activity timeline.
- `src/actions/incident-workflow.ts` — **take** (self-assign), **escalate**
  (move up a tier, unassign back to that tier's queue — escalation never
  goes back to the customer), **hold/resume**, **manager reassign**,
  **resolve** (requires notes; this is the moment the SLA-breach flag
  gets permanently calculated and stored), **close** (a separate step
  from resolve — only the requester or a manager can confirm the fix
  actually held), and **comment**.
- Every action writes an `IncidentActivity` row in the same database
  transaction as the state change, so the audit trail can never drift out
  of sync with the ticket's actual state.
- **Testing note:** this Windows dev environment doesn't have a headless
  browser tool available, so instead of skipping verification, the actual
  workflow logic was run directly against the real dev database (take →
  escalate → resolve → close) and the resulting page HTML was fetched and
  checked to confirm it matched — proof the feature works end-to-end, not
  just that it compiles.

## Stage 8 — Role-scoped dashboards (`516cc30`)

Before this stage, every role saw the exact same flat list of every
ticket — not how a real service desk tool works.

- Added a `currentTier` column to `Incident`. This was necessary, not
  decorative: once a ticket can be escalated and land back in
  "unassigned" state, there's nothing left on the record to say *which*
  tier it's now waiting on — the previous assignee is gone. `currentTier`
  is the field that answers "which tier's queue is this ticket in right
  now," whether or not it's currently claimed.
- `app/page.tsx` now renders a genuinely different view per role:
  customers see only tickets they reported; L1/L2/L3 agents see their own
  claimed tickets plus their tier's unclaimed queue; managers keep full
  visibility.
- Fixed a related inconsistency caught while building this: escalating a
  ticket was leaving its status as `IN_PROGRESS` even though the ticket
  had just become unassigned. Now it correctly resets to `NEW` (queued,
  waiting to be claimed).
- Verified by fetching each role's dashboard with a different session
  cookie and confirming the ticket counts, then actually escalating a
  live ticket and re-fetching both dashboards to watch it move from one
  agent's queue to the next tier's.

## Stage 9 — Docs: build log + interview talking points (`95c3fe8`)

Added this file, plus a personal talking-points reference (elevator
pitch, key decisions and reasoning, resume bullets, likely interview
questions) kept locally and out of version control — see the note in
Stage 10 below. Both are meant to be kept in sync with the project going
forward, not a one-time snapshot.

## Stage 10 — Keep the talking-points doc local-only

The interview talking-points file moved to `docs/private/` (already
covered by an existing `.gitignore` rule) and was untracked from git, so
it's readable locally but never pushed to GitHub — anyone else with
access to the repo shouldn't see the behind-the-scenes framing of why
certain scope cuts were made. Note: it had already been pushed once in
commit `95c3fe8` before this change, so it's still recoverable from that
commit's history on the remote unless that history is separately
rewritten.

## Stage 11 — Split dashboards into open vs. resolved/closed

As tickets accumulate, a flat list mixing every open ticket with every
resolved/closed one forever stops being useful — a manager or a customer
mainly cares about what's still open. The manager's "All incidents" list
and the customer's "My incidents" list are both now split into two
`IncidentGroup`s: **Open** (statuses `NEW` / `IN_PROGRESS` / `ON_HOLD`)
and **Resolved & closed**. Refactored the open/closed check into a single
`isOpenStatus()` helper in `app/page.tsx` — it's now used by the SLA
overdue badge and by both dashboard splits, instead of three slightly
different ways of asking the same question.

## Stage 12 — Fully purging the talking-points doc from history

Stage 10 stopped tracking `docs/private/PROJECT_SUMMARY.md` going
forward, but it had already been pushed once (commit `95c3fe8`) and was
still recoverable from that commit in the remote's history. Asked
explicitly whether to leave that as-is or fully scrub it, the answer was
to scrub it: rewrote every commit's history with `git filter-branch`
(`git-filter-repo` wasn't installed, so the older built-in tool was used
instead) to strip the file out of every commit that ever contained it,
then force-pushed the rewritten `main` to origin. Commits from that point
onward got new hashes as a result (`95c3fe8`→`f10a312`,
`2162ef7`→`e89d742`, `a20c443`→`f83b594`); earlier commits kept their
original hashes since their content never changed. A local-only backup
of the pre-rewrite history was kept on branch `backup-before-history-rewrite`
in case anything needed to be recovered, and was never pushed.

**Worth knowing if this comes up again:** rewriting published history is
disruptive by nature — it changes commit hashes, and anyone who already
cloned/fetched the old history keeps a copy until they re-sync. This was
a deliberate, explicitly-approved exception for a small solo-authored
repo with no other collaborators yet, not a default way to handle
"remove a file" requests.

## Stage 13 — Search and filter across incidents

Added `app/incidents/page.tsx`: a dedicated browse/search page, separate
from the personal "my work" dashboard on the home page. It answers a
different question — "does a ticket matching X exist at all" — with a
plain `<form method="GET">` (text search across ticket number/title/
description, plus status/priority/category dropdowns) that filters by
reloading the page with query-string parameters, which the Server
Component reads directly via `searchParams`. No client-side JavaScript
needed for this at all.

The search results respect the exact same role-visibility rule as the
dashboard (customer → own reports only; agent → claimed tickets + their
tier's queue; manager → everything) — expressed once as a Prisma `WHERE`
clause and `AND`-ed together with whatever search/filter values were
given, so an agent can't use search to see tickets outside their normal
visibility.

Extracted the ticket-list rendering (`IncidentListItem`, `IncidentGroup`,
`PageHeader`, `isOpenStatus`/`isOverdue`) out of `app/page.tsx` into
`src/components/incident-list.tsx` so the dashboard and the new search
page render tickets identically instead of maintaining two copies.

Verified by fetching `/incidents` with different role cookies and query
strings and confirming result counts matched the actual database state
(e.g. `?q=printer` narrowing 4 tickets down to exactly 1; an L1 agent's
unfiltered search only surfacing the 1 ticket they're allowed to see).

---

*(Next stages get appended below as they're built.)*
