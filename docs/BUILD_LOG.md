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

## Stage 14 — SLA "at risk" view for managers

Up to this point, the only way to notice a ticket approaching its SLA
deadline was to open it and read the countdown — nothing surfaced it
proactively. Added `getSlaRisk()` to `src/types/itil.ts`, which classifies
an open ticket as `BREACHED`, `AT_RISK`, or `ON_TRACK`. The interesting
design decision: "at risk" isn't a fixed time threshold (e.g. "under 1
hour left") — it's the **last 20% of the ticket's own SLA window**,
because a fixed threshold doesn't make sense across priorities. A P1 has
a 4-hour resolve window in total, so "1 hour left" is still 75% of its
life remaining; a P4 has a 72-hour window, where "1 hour left" is
basically already gone. Measuring by proportion-of-window-remaining
instead of raw minutes makes "at risk" mean the same thing regardless of
which priority a ticket is.

Verified the boundary math directly (10 of 240 minutes left on a P1 →
`AT_RISK`; exactly 20% remaining → `AT_RISK`; just over 20% → `ON_TRACK`;
past the deadline → `BREACHED`) before touching any UI. The manager
dashboard now leads with a "⚠ SLA at risk" section — breached tickets
first, then at-risk tickets sorted by soonest deadline — and every ticket
list everywhere (dashboard, queue, search results) now shows an amber
"At risk" badge alongside the existing red "SLA overdue" one. Confirmed
end-to-end by artificially aging a real ticket's clock to ~10 minutes
from breach and watching it appear in the manager's at-risk section
above the already-breached P1, then restored its original timing.

## Stage 15 — Response SLA gets its own permanent verdict

A real gap, not a new feature request: the schema had tracked a
`slaResponseDueAt` (first-response) target since Stage 3, but nothing
ever recorded whether it was actually met — the detail page just showed
a live countdown that quietly became meaningless once a ticket closed.
Resolution SLA, by contrast, got a permanent `slaBreached` flag the
moment a ticket was resolved. That asymmetry meant the two SLA promises
ITIL treats as genuinely separate ("we acknowledged this" vs. "we fixed
this") weren't actually being held to the same standard.

Fixed by adding `respondedAt` and `slaResponseBreached` to `Incident`,
and — since two similarly-named breached flags on one model is a
readability trap waiting to happen — renamed the existing `slaBreached`
to `slaResolveBreached` in the same migration, so it's never ambiguous
which SLA a given flag refers to. `prisma migrate dev` couldn't run
non-interactively in this environment (it wanted to confirm a
destructive drop-and-recreate for the rename), so the migration SQL was
hand-written using `ALTER TABLE ... RENAME COLUMN` instead — a better
outcome anyway, since it preserves the 4 existing rows' data instead of
dropping and recreating the column.

A shared `firstResponseFields()` helper in `incident-workflow.ts` records
`respondedAt`/`slaResponseBreached` the first time the service desk does
anything to a ticket — takes it, gets it reassigned, or resolves it
outright without ever formally being "taken" first (a real edge case: a
manager can resolve an untouched NEW ticket directly) — and is a no-op
on every call after the first, so re-taking a ticket after an escalation
never overwrites the original response time.

Verified by simulating a take on a live NEW ticket and confirming
`respondedAt` got set exactly once (a second call left it unchanged),
then fetching the ticket's detail page and confirming "First response
SLA" switched from a countdown to a permanent "Met SLA" badge.

## Stage 16 — A real automated test suite

Every feature up to this point was verified by hand each time — start the
dev server, run a throwaway script against the real database, delete the
script, move on. That proves a feature works *once*, but proves nothing
about whether the next change quietly breaks it. Added
[Vitest](https://vitest.dev) and a real test suite,
`src/types/itil.test.ts`, covering the pure business-rule functions in
`src/types/itil.ts`: the full 3×3 Impact×Urgency priority matrix, SLA
window calculation per priority, the escalation chain (including the
"nowhere left to escalate past L3" edge case), and the SLA risk
boundaries introduced in Stage 14 (the exact 20%-remaining cutoff,
formalized as a permanent regression test instead of a one-off manual
check).

These functions were the right place to start unit testing: no database,
no server, no mocking required — pure functions in, values out — which
is exactly why they were kept separate from the schema and the UI in the
first place (see Stage 3). To prove the suite isn't just vacuously
passing, deliberately broke the priority matrix (`HIGH`/`HIGH` returning
`P2_HIGH` instead of `P1_CRITICAL`) and confirmed 2 tests failed with a
clear diff before reverting the change and re-confirming all 28 pass.

Workflow logic (take/escalate/resolve/close, role-based visibility, tier
routing) still relies on the manual-verification-against-real-database
approach from earlier stages, not automated integration tests — a
reasonable next testing investment, not yet made.

## Stage 17 — Switching from SQLite to PostgreSQL for deployment

Local development had used SQLite from Stage 3 onward — great for "clone
and run," but incompatible with deploying to a serverless host like
Vercel, whose filesystem is ephemeral at runtime. Rather than host
somewhere with a persistent disk and keep SQLite, switched the database
to **Prisma Postgres** — the more defensible "real production database"
answer, and one that pairs with **Vercel**, the most recognizable host
for a Next.js portfolio project. Full detail is in the new
`docs/DEPLOYMENT.md`, which is being kept as a living document the same
way `BUILD_LOG.md` is.

This required the user to provision the database themselves (a Prisma
Console account isn't something this session could create), then six
coordinated code changes: the schema's datasource provider, the
PostgreSQL driver adapter (`@prisma/adapter-pg` + `pg`, replacing
`@prisma/adapter-better-sqlite3`) in both `src/lib/prisma.ts` and
`prisma/seed.ts`, a fresh migration baseline (the old migrations were
SQLite-specific SQL), a `postinstall: prisma generate` script so Vercel's
build regenerates the gitignored client, and removing the now-unused
SQLite dependencies.

**The genuinely interesting part:** this surfaced a real cross-database
bug, not a hypothetical one. The search page's text filter relied on
SQLite's default case-insensitive `LIKE` — every test up to this point
searched with matching case, so it looked correct. PostgreSQL's `LIKE`
is case-sensitive by default; the identical query with different casing
(`"DRIVE"` vs. `"drive"`) silently returned zero results once the
database switched. Caught by deliberately testing a mixed-case search
against the new database rather than assuming SQLite behavior would
carry over, and fixed with Prisma's `mode: "insensitive"` on the search
filter. This is a good example of something a type-checker and a green
test suite both miss — it's a runtime provider default, not a type — and
exactly why "the build succeeded" and "I ran the actual feature" are
different claims.

Verified the whole stack post-switch: seeded the new database, re-ran
the full take→escalate→resolve→close lifecycle against it directly, hit
the dashboard/detail/search pages and confirmed they render from
Postgres correctly, re-ran the Vitest suite (unaffected, since those
tests have no database dependency), and ran an actual production build
(`npm run build`, the exact command Vercel runs) followed by `npm start`
to confirm the compiled output serves correctly — not just that the dev
server does.

Deploying to Vercel itself is a separate step handled in the user's own
Vercel account (see `docs/DEPLOYMENT.md` Stage D3) — no credentials an
agent could hold are involved, since Vercel's GitHub integration
authenticates through the browser.

---

*(Next stages get appended below as they're built.)*
