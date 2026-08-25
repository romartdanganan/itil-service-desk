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

## Stage 18 — Live at itil-service-desk.vercel.app

The project is deployed: **https://itil-service-desk.vercel.app/**.
Verified it's actually working, not just that the deploy succeeded —
fetched the home page, `/incidents`, and `/incidents/new` and confirmed
all three return `200`, with the home page rendering real data from the
production Postgres database (a seeded incident title appearing in the
response), not a stale or cached build.

## Stage 19 — Training Simulator: "calls" to practice on

A different kind of feature than everything before it: not another piece
of the Incident Management lifecycle, but a practice mode requested
directly — the user wanted the app to actually teach IT troubleshooting,
not just track tickets. The idea: a simulated support call comes in, you
pick your first diagnostic step from a multiple-choice question, get
immediate feedback on that specific choice, then see the real resolution
regardless of whether you got it right.

**Data model** (`prisma/schema.prisma`): `TrainingScenario` /
`TrainingChoice` / `TrainingAttempt`, deliberately kept separate from
`Incident` rather than reusing it — a practice attempt at a canned
scenario has nothing to do with real ticket data, and folding them
together would mean every real incident query needs to start filtering
out fake training rows. `TrainingAttempt` is append-only by design (never
updated or deleted): a trainee retrying a scenario after getting it wrong
is the whole point of a training tool, so the schema keeps every attempt
rather than overwriting a single "current answer" field. This is what
lets `/training` show "resolved" based on your *most recent* attempt
while still being honest that an earlier one was wrong.

**Content** (`src/data/training-scenarios.ts`): 6 scenarios (`prisma
db seed`-loaded) spanning Network, Software, Hardware, Access, and
Account categories at Beginner through Advanced difficulty, following
the same "content lives in a plain data file, not the database schema or
the seed script" pattern already established for the ITIL policy in
`src/types/itil.ts`. Each scenario's question is deliberately about the
*first diagnostic step*, not "what's broken" — the skill being taught is
triage process. The wrong answers were written to be plausible mistakes
a real trainee might actually make, not obviously-silly distractors:
jumping straight to a disruptive fix (resetting a shared switch, ordering
replacement hardware) before confirming that's even the problem,
escalating before doing any basic troubleshooting, or — in the account
lockout scenario — skipping identity verification because the caller
already gave a username. That last one is a genuine security-awareness
lesson (identity verification before any account action, no exceptions
for a caller who "sounds" legitimate), not just a technical one.

**Flow**: `app/training/page.tsx` lists every scenario with a live score
("resolved N of M calls") and a per-scenario status badge based on the
user's latest attempt. `app/training/[id]/page.tsx` renders the call as
a transcript (both caller lines shown together — a deliberate choice over
building a full branching dialogue engine, see the comment in the data
file), then the multiple-choice form, then — after
`src/actions/training.ts`'s `submitTrainingAnswer` records the attempt —
redirects back to the same URL with `?answered=<choiceId>` so the page
re-renders showing that specific choice's explanation plus the scenario's
real resolution. Using a query param for the reveal state (rather than
component state) keeps this feature server-rendered with zero client-side
JavaScript, consistent with the rest of the app.

Verified end-to-end against the live Postgres database: confirmed all 6
scenarios list correctly, fetched a scenario page in all three render
states (unanswered form, wrong-answer reveal, correct-answer reveal) and
checked the right content appeared in each, then recorded a real wrong
attempt followed by a real correct attempt for the same user/scenario and
confirmed the list page's score and badge updated correctly at each step
(0/6 with an amber "Try again" badge, then 1/6 with a green "Resolved"
badge) — proving the "status reflects your latest attempt" design
actually works, not just that the schema supports it.

Pushed to `main`; Vercel auto-deployed within about 30 seconds (confirmed
by polling `/training` until it flipped from `404` to `200`). Fetched the
live `/training` page afterward and confirmed all 6 scenarios list
correctly against the production database, not just the local one.

## Stage 20 — Real authentication, replacing the role-switcher

The single most-repeated "known gap" across every doc up to this point:
the cookie-based role switcher wasn't authentication, it was a demo
convenience — anyone could edit that cookie in devtools and become any
user. Asked to close that gap, plus told the app should keep "simulating
how it is to be an IT" realistically.

**Decision: hand-rolled auth over a library.** This Next.js version has
real breaking changes from what most training data assumes (see
`AGENTS.md` at the repo root) — `middleware.js` doesn't exist anymore,
it's `proxy.js`, confirmed by actually reading
`node_modules/next/dist/docs/` before writing anything, the same
discipline that caught the Prisma driver-adapter surprise back in Stage
3. Rather than add a third-party auth library with its own
compatibility assumptions on top of an already-unusual Next.js version,
this follows the pattern Next.js's own official docs recommend for this
exact case: a stateless session — a JWT (via `jose`) holding just the
user id, signed with a server-only secret, stored in an HttpOnly cookie
— plus bcrypt-hashed passwords (`bcryptjs`, pure JS, no native build
step, unlike the `better-sqlite3` binary that needed install-script
approval back in Stage 3). It's also the more honest answer to "do you
understand how auth works" than "I imported a library."

**Compatibility-preserving refactor:** `getActiveUser()` in
`src/lib/session.ts` keeps the exact same signature it always
had — `Promise<User | null>` — just backed by a verified session
instead of a plain cookie read. Every one of the ~15 call sites across
every page and Server Action needed zero changes as a result; only
`session.ts` itself changed internally.

**Schema:** added `passwordHash` (required) and `isDemoAccount`
(defaults false) to `User`. The first migration hit real production
data: 5 existing seeded users needed real password hashes, and `prisma
migrate dev` won't run non-interactively when a NOT NULL column addition
needs a decision about existing rows (same class of issue as Stage 12's
history rewrite, different cause). Solved the same way — a hand-written
migration — computing the demo password's bcrypt hash up front and using
it as a temporary column `DEFAULT` to backfill the 5 rows, then dropping
the default so every future insert must supply its own hash explicitly.

**Preserving the frictionless demo:** losing "instantly try any role"
would have been a real regression for a portfolio project people are
meant to click through quickly. The fix: real signup/login is fully
functional, but the login page also lists the 5 seeded personas as
one-click "quick demo sign-in" buttons — hidden form fields carrying
that account's real email and the shared demo password, submitted
through the *same* authentication path as a typed-in login, not a
backdoor. `isDemoAccount` on `User` is what scopes this list to exactly
those 5 seeded rows and never to a real self-registered customer's
account, however many sign up over time.

**Realistic role modeling:** self-registration (`/signup`) always
creates a `CUSTOMER` account — there's no role field on the form to
trust in the first place, matching how a real IT department provisions
agent/manager accounts internally rather than letting anyone self-serve
into one.

**A real security habit, not just a feature:** the login error message
is identical whether the email doesn't exist or the password is wrong
("Invalid email or password.") — revealing which one it was is a genuine
account-enumeration leak, not a UX nicety to skip for a portfolio
project.

**One deliberate, justified departure from "no client JS":** the login
and signup forms are this app's first Client Components since the
now-deleted role-switcher, using React's `useActionState` so a wrong
password shows inline without a full page reload — copied directly from
the pattern in Next.js's own authentication guide.

**Access policy change:** every page that reads real ticket or training
data now redirects to `/login` if nobody's signed in, replacing the old
"show everything to anonymous visitors" fallback — a real service desk
portal isn't publicly browsable, and with one-click demo sign-in this
costs a visitor nothing but a single click.

Verified end-to-end against the live production database: confirmed
`bcrypt.compare` against all 5 backfilled password hashes, confirmed a
wrong password is rejected, drove a real authenticated HTTP request by
minting a session token with the same signing logic and setting it as a
cookie via curl (proving `getActiveUser()`'s cookie-verification path
works, not just the unit-level JWT logic) — the resulting page correctly
rendered Jordan Lee's actual L1 dashboard. Confirmed a tampered cookie
is rejected and treated as logged out, confirmed an anonymous request
to `/` 307-redirects to `/login`, confirmed an authenticated request to
`/login` redirects away to `/`, and confirmed self-registration always
creates a `CUSTOMER` account with `isDemoAccount: false` regardless of
any other field a crafted request might include.

## Stage 21 — Simulated email notifications (`/inbox`)

The user's steer for this stage was explicit: keep the app feeling like
an actual IT job to practice against, and specifically called out
"emails" as part of what a real service desk realistically has. No real
email provider was set up (out of scope for a portfolio demo, and a real
cost/account dependency like the Postgres/Vercel steps earlier), so this
models the same behavior as an in-app "inbox" — the message content a
real deployment would have emailed, without anything actually leaving
the app.

**New model:** `Notification` — `recipientId`, an optional `incidentId`
link, `subject`/`body` (denormalized as plain text rather than composed
from `IncidentActivity` at read time, since a notification is a
point-in-time message that shouldn't reword itself if the ticket's title
changes later), and a `read` flag.

**Triggers**, wired directly into the existing `incident-workflow.ts`
Server Actions as extra operations inside the same `$transaction([...])`
arrays (atomic with the ticket update and activity row each one already
writes):

- **Take / reassign** → notify the new assignee. Reassign also notifies
  the requester, but *only* on the ticket's actual first response — not
  every time it changes hands after an escalation. This reuses the
  existing `firstResponseFields()` first-response detection from Stage
  15 outright, rather than inventing a second "have we told them yet"
  flag: `"respondedAt" in firstResponseFields(incident)` is `true`
  exactly once, on the true first response, which is exactly the
  condition this needed too.
- **Escalate** → notify the requester their ticket moved to the next
  tier.
- **Resolve** → notify the requester, including the resolution notes.
- **Close** → notify the requester, but only if someone closed it *for*
  them (a manager, on their behalf) — closing your own ticket doesn't
  need a notification telling you what you just did.
- **Comment** → notify "the other party": a customer's comment notifies
  the assignee (if the ticket has one yet); an agent's or manager's
  comment notifies the requester. Never notifies the comment's own
  author.

**UI:** `/inbox` lists a user's notifications and — deliberately, like
checking real email — marks everything currently unread as read the
moment the page is viewed, rather than requiring a per-row click. The
header gets an unread-count badge next to the new "Inbox" link,
computed in the root layout alongside the existing session lookup.

Verified against the live production database with a dedicated
end-to-end script: created a fresh, never-responded-to test incident and
drove it through take → escalate → reassign → comment → resolve → close,
confirming the requester received exactly 4 notifications (first
response, escalation, resolution, closure — correctly *not* re-notified
on the second reassignment, since they'd already gotten a first-response
notification) and the reassigned agent received exactly 2 (assignment,
comment). Then checked the actual `/inbox` page and header badge via a
minted session cookie: badge showed "2" before viewing, notifications
rendered with a "New" indicator on first view, and both the badge and
the "New" indicator correctly disappeared on a second visit after the
first one had marked them read.

## Stage 22 — Doubling the Training Simulator's content

6 more scenarios (12 total), added specifically to round out gaps in the
existing set: no `OTHER`-category scenario existed at all, and
`INTERMEDIATE`/`ADVANCED` difficulty was thin outside Network. Each new
one teaches a distinct lesson the first 6 didn't already cover:

- **Isolate before diagnosing** (a spreadsheet that "won't open" — test
  the known-good copy on the suspect machine before concluding the file
  itself is corrupted).
- **Gather evidence before acting** (a laptop shutting down under load —
  check thermal/power logs before swapping a battery based on the
  general pattern rather than this caller's specific symptoms).
- **Proper process resists urgency, not just requests** (a new hire
  asking for finance-drive access directly, manager conveniently
  unavailable — route through actual approval regardless of how
  reasonable the ask sounds, since that's exactly the pressure a real
  unauthorized-access attempt would also use).
- **Recovery over disabling security** (a lost authenticator app —
  recovery codes and re-enrollment, not turning off two-factor to solve
  one login).
- **Authority pressure doesn't override policy** (a VP demanding a
  same-day admin-rights exception) — the strongest scenario of the
  batch: neither blind compliance nor a flat unhelpful refusal is
  correct, the right answer is solving the *underlying* business need
  through a compliant path.
- **Turn a vague complaint into a diagnosable one** ("my computer is
  being weird") — the first real skill in triage is asking narrowing
  questions before anything can be checked or fixed at all.

Inserted directly into the live production database (the same
`insert-only-if-title-missing` pattern used for the original 6, since
`prisma db seed` only runs against an empty table and re-running it
would collide on the existing users' unique emails). Verified via the
running app: the training list correctly shows "12" total and the new
`OTHER` category label, and the VP scenario's choices were confirmed to
preserve their authored order (correct answer first, as written) both
directly against the database and through the actual rendered page.

## Stage 23 — Shift Mode

A previously-floated idea, built now: `/training` lets you pick one
scenario at a time and retry freely, which is great for learning but
nothing like an actual shift, where a call happens once and you don't
get to rewind it. Shift Mode queues 5 calls back-to-back and removes the
retry safety net mid-shift — closer to the real pressure the app is
meant to simulate.

**Schema:** a new `Shift` model — `scenarioIds` is a native Postgres
`String[]`, not a join table, because the queue's order is fixed at
creation and never changes, so a join table's extra structure wouldn't
buy anything. `TrainingAttempt` gets an optional `shiftId` back-reference.
The genuinely interesting design point: **which call is "current" is
never stored as a position counter** — it's always derived as
`scenarioIds[attempts.length]`, the same "derive it from what actually
happened rather than caching a value that could drift" instinct already
used for SLA risk elsewhere in this app. This does double duty as the
anti-replay guard too: `submitShiftAnswer` rejects any submission whose
`scenarioId` isn't exactly the one at that derived position, which is
what makes "no retries mid-shift" actually enforced server-side rather
than just a UI convention nothing stops someone from working around.

**Refactor:** extracted the call-transcript/question/reveal UI, shared
between freeform practice and Shift Mode, into
`src/components/training-call.tsx` — the two pages now render the exact
same core with different Server Actions and different post-reveal
navigation, rather than maintaining two copies that would drift apart.

**A UI subtlety worth documenting:** right after answering a call, the
redirect lands on `/shift/[id]?answered=<choiceId>`. By that point
`attempts.length` has already advanced past the just-answered call — so
naively deriving "current call" from it would jump straight to the next
call's blank form instead of showing the reveal for the one just
answered. The page special-cases the `answered` query param to render
the *last recorded* attempt's reveal instead, and only falls through to
"derive the current call normally" once that param is gone (i.e. after
clicking "Next call").

Verified against the live production database: ran a full 5-call shift
through the actual action logic (alternating correct/incorrect answers),
confirmed the shift marked itself complete with exactly the right
attempt count and score, and confirmed the derived "next expected
scenario" correctly becomes `undefined` once finished — proving a
post-completion retry attempt would be rejected. Checked the real pages
too: a fresh shift's `/shift/[id]` correctly showed "Call 1 of 5" with a
blank form, the completed shift's summary correctly showed "3 of 5
correct" with alternating Correct/Incorrect badges matching the actual
answers given, and — the ownership check — a second user's session
cookie got a `404` trying to view someone else's shift.

## Stage 24 — Fixing a real usability problem: an empty, unexplained app

Direct, important feedback: logging in as Sam Patel (L2) showed no
tickets and no explanation of what to do, and separately, the term
"Knowledge Base" got asked about with "is that kubernetes?" — a concrete
sign the accumulated ITSM vocabulary in this project's docs had outpaced
what's actually been explained *in the product itself*. Everything
mentor-style built up so far lived in `BUILD_LOG.md`, code comments, and
chat — none of which a person actually using the live app as a practice
tool ever sees.

Two root causes, both fixed:

**1. The app had almost no ongoing content.** Tickets only ever appeared
if a human manually filled out "Log New Incident" as a customer — there
was no mechanism simulating the steady stream of new problems a real IT
job actually has. Investigating the live database confirmed this
directly: several tickets titled literally `"asd"` (clearly
form-testing, not real practice content), and every other real ticket
sitting unassigned in the **L1** queue specifically — which is *correct*
ITIL behavior (every new ticket starts at L1), but meant an L2 or L3
agent logging in found a genuinely empty dashboard, because nothing had
ever been escalated up to them.

Fixed with a content bank + generator, the same pattern as the Training
Simulator's scenarios: `src/data/incident-templates.ts` (18 realistic
tickets across every category/impact/urgency combination) and
`src/data/npc-employees.ts` (6 fictional employees across departments,
real `User` rows so `requesterId` has something to point at, but never
marked `isDemoAccount` — they don't show up in quick sign-in, and their
distinct `@acmeco.example` domain is what the generator uses to find
exactly this pool and nothing else). `generateIncomingTickets()` in
`src/actions/generate-tickets.ts` — agent/manager only — creates a fresh
batch on demand, exposed as a **"🔄 Simulate new tickets arriving"**
button on the agent and manager dashboards. A shared `shuffled()`
Fisher-Yates helper (`src/lib/random.ts`) was extracted from Shift Mode's
local copy for this, rather than duplicating it a second time.

Cleaned up the `"asd"` test tickets on the live database, generated a
fresh batch, then walked several of them through *real* take/escalate
steps (using the actual workflow logic, not fake pre-set fields) so
every seeded role has genuinely distinct, realistic work waiting: Jordan
(L1) with an in-progress ticket plus a full queue, Sam (L2) with an
assigned ticket and a queued escalation, Casey (L3) with a
specialist-level ticket. Hit a real, separate bug doing this by hand:
count-based ticket numbering (`INC` + row count) collided once rows had
been deleted, creating a gap the count didn't account for — fixed by
switching the one-off cleanup script to derive the next number from the
actual max existing ticket number instead. (This isn't a live bug in the
app itself — nothing in the real UI ever deletes a ticket — but worth
noting as the kind of edge case count-based numbering is fragile to.)

**2. The product didn't explain itself.** Added a plain-language
`RoleExplainer` block to each dashboard view — customer, agent, manager
— stating in one paragraph what that role is actually for and what to
do next, with ITSM terms (SLA, escalate, tier) defined inline rather
than assumed. Strengthened the "Log New Incident" page similarly: it
now says outright that this represents the *customer's* side of the
story, and that priority isn't picked directly, it's calculated from
Impact/Urgency below.

Verified end-to-end against the live production database and the actual
rendered pages (not just the underlying data): fetched Sam's dashboard
and confirmed "My tickets (1)" and "queue (1)" showed the exact tickets
just walked through, same for Casey (L3) and Jordan (L1), and the
manager's view correctly showed the full open-incident total across all
of it.

## Stage 25 — Closing the loop: "where did my incident go?"

Stage 24's explainer text apparently wasn't enough — the very next round
of feedback was "I don't understand the purpose of logging a new
incident, where do I find these logged incidents, is there some sort of
developer page I have to access." That's a stronger signal than a wording
gap: *text explaining the feature* wasn't a substitute for the feature
*showing its own result*.

Root cause: submitting "Log New Incident" redirected back to the
dashboard — a list you'd have to spot your new ticket inside (or not see
at all, depending on what your current role's dashboard is scoped to
show). The fix is structural, not more explanation: `createIncident()`
now redirects straight to `/incidents/[id]?created=1` — the ticket you
just made, not a list to search through. The `created` param triggers a
one-time green banner ("✓ Logged as INC000123 — this is your new
ticket...") explaining in the moment that it starts in the L1 queue and
won't move until an agent picks it up (or you switch roles and take it
yourself) — and doesn't reappear on a later, ordinary visit to the same
page.

Also answered the "developer page" question directly in the "Log New
Incident" page's own explainer: there isn't a separate admin view in
this app — every ticket lives in the same data, filtered by whichever
role is signed in, and the closest thing to "see everything" is signing
in as the Manager and using the existing `/incidents` Search page.

Verified by creating a real test ticket (same logic `createIncident`
uses) and fetching its detail page with and without `?created=1` — the
banner rendered with the correct ticket number in the first case and was
completely absent in the second, confirming it's genuinely a one-time
"you just did this" moment, not a permanent fixture that would get
confusing on every later visit.

---

## Stage 26: Problem Management (v2)

Incident Management was complete and tested, so this stage started the
second ITIL process the README always said would come next: Problem
Management. In real ITIL, an Incident gets a service back up for one
person or one report; a Problem asks why it keeps happening at all, and
is worked as its own internal investigation rather than as another
ticket in the same queue.

**Scope decision, made deliberately narrow:** Incident escalation uses a
tier ladder (`currentTier` plus `escalateIncident`) because Incident
triage is high volume and SLA-driven. Problems are neither, by design
there are meant to be far fewer Problems than Incidents feeding into
them, and there is no SLA clock on a Problem in this project's scope. So
a Problem gets a single nullable `owner`, self-assignable by any agent
or manager, reassignable by a manager to a named agent, and no
per-tier queue. `/problems` shows every open problem to every agent and
manager equally. This kept the feature to one clean vertical slice
instead of doubling the whole escalation machinery for a signal this
project does not otherwise teach about Problems.

**Schema:** two new models, `Problem` and `ProblemActivity` (the same
append-only audit trail pattern as `IncidentActivity`), plus a nullable
`problemId` on `Incident`. `Problem` reuses `IncidentCategory` and the
`Impact`/`Urgency`/`Priority` machinery from `src/types/itil.ts` rather
than inventing a parallel scale, since "how bad is this" does not
change just because the question is being asked about a root cause
instead of a single ticket. The one field pair worth calling out is
`workaround`/`workaroundAt`: recording a workaround is what makes a
Problem a Known Error in ITIL terms, and there is deliberately no
separate boolean flag for that state. `recordWorkaround()` sets the
workaround text and `status: KNOWN_ERROR` in the same write, so the two
can never say different things about the same problem.

**Lifecycle:** `NEW` to `INVESTIGATING` to `KNOWN_ERROR` to `RESOLVED`
to `CLOSED`, driven by `src/actions/problem-workflow.ts`
(`takeProblem`, `reassignProblem`, `recordWorkaround`, `resolveProblem`,
`closeProblem`, `addProblemComment`) following the exact same shape as
`incident-workflow.ts`: load the actor, load the record, check the ITIL
permission rule, write inside a transaction alongside an activity row
and any notifications, then revalidate. One rule is intentionally
stricter than its Incident equivalent: closing a Problem is manager-only,
not requester-or-manager, because a Problem has no customer whose
confirmation closure depends on. It is purely an internal governance
step.

**The actual payoff:** this whole feature exists to make one moment
concrete, an agent working an incident that turns out to be caused by
something already understood should not have to re-diagnose it from
scratch. `src/actions/problems.ts` handles both ways an Incident gets
linked to a Problem: `createProblem` (raise a new Problem, optionally
pre-filled from a source incident via `/problems/new?fromIncidentId=`,
auto-linking it) and `linkIncidentToProblem` (link an incident to a
Problem that already exists). The moment a linked Problem is already a
Known Error, or becomes one while an incident is already linked to it,
the assigned agent gets a notification with the workaround text, and the
incident's own detail page shows an amber "Known workaround" callout
directly, no navigating away required.

**Never customer-facing, on purpose:** every `/problems` page redirects
away anyone who is not an agent or manager, checked server-side at the
top of each page (`isAgentRole`), the same "nav hiding is UX only, the
real gate is server-side" pattern already used elsewhere in this app.
The nav link itself is hidden from customers too, in `app/layout.tsx`.

Verified end to end against the live database with a real browser
driver rather than by reading code: signed in as the seeded L1 agent,
flagged a real incident as a new problem, confirmed the pre-fill and the
auto-link and the resulting activity rows on both records, took the
problem, recorded a workaround and watched its status become Known
Error, then reopened the linked incident and confirmed the workaround
callout rendered there immediately. Separately created a second problem,
took it, recorded its workaround, then linked a different, previously
unlinked incident to it purely through the "link to an existing problem"
dropdown and confirmed the same workaround callout appeared on that
incident too, exercising the other code path into the same result.
Signed in as the seeded Customer and confirmed there is no Problems nav
link and that `/problems` redirects straight back to their own
dashboard. Signed in as the seeded Manager and walked a problem through
resolve (root cause required) and close, confirming the close action is
manager-only along the way, and confirmed the resulting notification
rendered correctly in the raiser's inbox. All test data created during
this pass was deleted from the database afterward so the live demo's
seed data was left exactly as it was found.

---

## Stage 27: Graded written-response training exercises

The original goal for this whole project, going back to the very first
conversation about what to build, was practice for a real IT job with
some exercises graded by multiple choice and some graded on actual
writing, with tips. Multiple choice existed. Graded writing never got
built. This stage closed that gap.

Judging whether a written explanation is clear, accurate, and
appropriately toned is not a job for keyword matching, it is a real
judgment call, so this uses an LLM to grade instead of a rubric of
required phrases. The model is Google's Gemini API rather than Claude
or OpenAI, specifically because Gemini's API has a genuinely free tier
with no credit card required, which mattered a lot here: a portfolio
project meant to be cloned and run by anyone should not require the
next person to pay for an API just to see every feature work. Called
directly over `fetch`, no SDK, so the entire integration is one
readable HTTP call in `src/lib/grade-written-answer.ts` rather than an
abstraction layer to learn.

**Where it fits:** added as a second step after each call's existing
multiple-choice question, not a parallel content track. The
multiple-choice question tests "what would you do first" (a process
question); the new step asks "how would you explain it to the caller"
(a communication question), using the same 12 scenarios already
written rather than doubling the content-authoring work. Each scenario
got its own `writtenPrompt`, written to match that scenario's specific
lesson rather than reusing one generic prompt everywhere, for example
the VP-pressuring-for-a-policy-exception scenario asks the trainee to
write exactly what they would say to hold the line professionally,
while the vague "my computer is being weird" scenario asks for the
actual clarifying questions that would turn that into a real ticket.

**Schema:** a new `WrittenResponse` model, one to one with
`TrainingAttempt` via a unique `attemptId`, rather than new columns on
`TrainingAttempt` itself. `TrainingAttempt` is documented as
append-only, never updated after creation, and grading happens moments
after the multiple-choice answer is recorded, not as part of that same
write, so a separate table keeps that invariant true rather than
quietly breaking it. `TrainingScenario` got one new nullable field,
`writtenPrompt`, nullable so a scenario can opt out (none currently
do, but nothing requires every future scenario to have one).

**Grading is optional, not a gate.** "Next call" is available whether
or not the written step gets completed, matching the app's existing
low-friction tone everywhere else, retrying or skipping is never
punished. It is also scoped to freeform practice only, not Shift Mode,
since Shift Mode's whole identity is fast, one-shot triage under
pressure and a graded writing exercise is a different kind of task
worth keeping separate for now.

**A real bug the live API caught immediately:** the model originally
picked, `gemini-2.5-flash`, returned a 404 the moment this was tested
against a real key, `models/gemini-2.5-flash is no longer available to
new users`. Listing available models against the actual key showed it
still exists in the catalog but genuinely is not callable for a new
account, an easy trap for anyone copying an older tutorial. Switched to
`gemini-3.6-flash`, the exact model the error message pointed at, and
confirmed it works.

Setting up the API key itself was new ground: walked through getting a
free key from Google AI Studio and adding it to `.env` as
`GEMINI_API_KEY`, documented in `.env.example` the same way
`DATABASE_URL` and `SESSION_SECRET` already are, but explicitly called
out as optional, every other part of the app runs fine without it, only
written-response grading needs it.

Verified against the live database with a real browser: answered a
call's multiple-choice question, confirmed the written prompt appeared
right after, submitted a deliberately lazy, lowercase, non-answer
("idk its broken, i pressed some buttons and it still doesnt work, can
u just fix it") and got back a 1 out of 5 with a specific, accurate
critique, not a generic "try harder." Retried the same scenario with a
genuinely good customer-facing explanation and got a 5 out of 5 with
a specific compliment and one specific, real suggestion, confirming the
score actually tracks answer quality rather than just rewarding
submitting something. Confirmed each retry's written answer stayed tied
to its own attempt, not overwriting the previous one's grade. All test
attempts created during this pass were deleted afterward, same as
every other stage that touches the live database.

---

## Stage 28: Change Management

The third and final core ITIL process this project simulates, alongside
Incident and Problem. The README has pointed at this since v1: build one
process completely before starting the next. It also closes a real gap
Problem Management left open: a Problem's rootCause and resolutionSteps
describe what needs to happen, but in real ITIL the actual work of
deploying that fix, a config change, a patch, a rollback, goes through
its own governed process before it happens. Without Change Management,
"resolve the problem" was the end of the simulated story. Now it can
lead somewhere.

**Three change types, genuinely different behavior, not just a label.**
`STANDARD` changes are routine and pre-approved by definition, so they
start already `APPROVED`, no manager action needed. `NORMAL` changes
start `REQUESTED` and always wait for a manager's decision before they
can begin. `EMERGENCY` changes are the interesting case: something is
actively broken, there is no time to wait for a CAB meeting, so an
emergency change can move straight to `IN_PROGRESS` from `REQUESTED`,
but it still needs approval recorded, retroactively, before it can be
marked complete. That is how real emergency changes actually work, act
first, get signed off after, and it seemed worth simulating honestly
rather than treating "emergency" as just a priority label on top of the
same approval flow as everything else.

**Outcomes are tracked honestly.** `COMPLETED` and `FAILED` are both
real, distinct endings, not just "done" and "not done." A `backoutPlan`
field, required at creation, only means something if failure is an
outcome the tool actually lets happen and records, so this stage
deliberately did not sweep every implementation into "completed."

**Schema:** `Change` and `ChangeActivity`, same audit-trail pattern as
`Problem`/`ProblemActivity`. The one new relationship worth noting:
`Change.sourceProblemId`, an optional link back to the Problem a change
is delivering the fix for, visible from both sides, the Change page
shows what Problem it addresses, and the Problem page now shows a
"Changes raised from this problem" list with a one-click "Raise a
change" action, completing the Incident to Problem to Change chain
started when Problem Management shipped.

**A small business-rule addition, not a big one:** `src/types/itil.ts`
got exactly one new function, `canStartWithoutApproval(changeType)`,
true only for `EMERGENCY`. That is the single rule that actually
differs between change types once creation-time auto-approval for
STANDARD is accounted for, so it earned a name instead of staying an
inline conditional buried in the workflow action.

Verified end to end against the live database with a real browser, all
three change types: raised a Problem, resolved it, raised a NORMAL
change from it (confirmed the Problem page listed it immediately),
approved it as manager, started and completed it as an agent, then
confirmed the Problem page reflected the completed change and closed it
as manager, checking the full activity trail read correctly at every
step. Separately raised a standalone STANDARD change and confirmed it
showed `APPROVED` the instant it was created, no manager action taken.
Raised a standalone EMERGENCY change, started it immediately with zero
approval, confirmed the "Mark completed" button was genuinely disabled
until a manager recorded retroactive approval, then confirmed
completion succeeded right after. Raised a second NORMAL change and had
a manager reject it with a reason, confirming the rejection reason
reached the requester's inbox correctly. Confirmed a customer sees no
Changes nav link and gets redirected away from every `/changes` page.
All test data created during this pass was deleted from the database
afterward, same as every prior stage that touches the live database.

---

## Stage 29: A UI polish pass, found by actually looking

Three features shipped back to back (Problem Management, Change
Management, written-response grading) without ever checking what the
result actually looked like on a phone or on a long, busy dashboard.
Rather than guess at what "polish" might mean, this stage started with
a real visual audit, a headless browser driven across every major page,
every seeded role, both light and dark mode, and both a desktop and a
mobile viewport, screenshots taken and actually looked at. That surfaced
two genuine problems, not cosmetic nitpicks.

**The header nav was broken on every signed-in mobile page.** Once
Problem and Change Management added their own nav links, a signed-in
header had to fit six things (Search, Problems, Changes, Training,
Inbox, plus the account block) in one row with no responsive handling
at all. On a phone that's not a tight fit, it's an overflow: the site
title itself wrapped across three lines, nav links and the sign-out
button spilled past the edge of the screen and overlapped each other.
Fixed with a CSS-only hamburger menu, no client JavaScript, matching
this app's existing forms-over-fetch philosophy: a hidden checkbox
input plus a label plus Tailwind's `peer-checked` variant is enough to
toggle a stacked mobile dropdown, the desktop row is completely
untouched above the `sm` breakpoint. The link list itself now lives in
one variable in `app/layout.tsx` and gets rendered twice (desktop row,
mobile dropdown) instead of being written out twice by hand, so the two
can't quietly drift apart later.

**The manager's dashboard showed the same tickets twice.** Every ticket
already breached or at risk of breaching its SLA appeared once under
"SLA at risk," the intentional triage-first list, and then appeared
again immediately below under "Open incidents," which had no reason to
exclude them. On a live database with several overdue tickets, that
meant scrolling past the same seven cards twice in a row before reaching
anything new. Fixed in `app/page.tsx` by excluding whatever's already in
the SLA-at-risk set from the open-incidents list below it, each ticket
now shows up in exactly one group.

Verified with the same browser-driven approach used to find the
problems in the first place, not just by reading the diff: confirmed the
mobile menu opens and closes correctly and every link/name/sign-out is
reachable and readable for both an agent (most nav items) and a customer
(fewest), confirmed the desktop header rendered identically to before
(no regression above the `sm` breakpoint), and confirmed the manager
dashboard's "Open incidents" count dropped from 13 to 6 with zero
overlap against the 7 already shown in "SLA at risk."

---

## Stage 30: Per-visitor demo sandboxing

A real concern, not a hypothetical one: this app's "quick demo sign-in"
buttons let anyone become any of the 5 seeded accounts with one click,
Manager's password is shown right on the login page for exactly that
reason. But those 5 accounts are single shared database rows. If one
visitor logs a real incident as Alex Rivera, and a total stranger also
clicks "quick sign in as Alex Rivera" or as Manager, that stranger sees
exactly what the first visitor typed. Nothing about which shared account
happens to be active says who actually created something. That's both a
privacy problem (strangers reading each other's typed-in content) and an
open door for anyone to fill the shared queue with spam that every future
visitor then has to wade through.

The fix people usually reach for first, turning off self-registration or
stripping down Manager's visibility, would have thrown away real,
deliberate features: self-registration demonstrates real auth working
end to end, and Manager's full visibility is the actual ITIL lesson
that role teaches. Neither needed to go. What was missing was narrower:
each visitor's own browser needed to be its own private sandbox,
regardless of which named account is active in it.

**The mechanism:** a new cookie, `demo_session`, completely separate
from the login cookie, assigned to every browser on its first request
by a new `proxy.ts` (Next.js renamed the old `middleware.ts`
convention in the version this project is on, the build immediately
flagged the deprecation, so this project uses the current name). Unlike
the login cookie, it's never cleared by signing out, it identifies the
visitor, not whichever account they're currently using. Every Incident,
Problem, and Change got a nullable `demoSessionId` column, stamped at
creation. A record is visible if that column is null (the app's
existing seed data and anything generated before this shipped, shared
baseline content for everyone, exactly like today) or it matches the
current browser's own session. Every list, dashboard, and detail page
across all three models got this one extra rule ANDed onto its existing
role-based visibility query, and every detail page now uses that same
check to 404 a direct URL guess at another visitor's private record, not
just hide it from lists.

Deliberately left out of this pass: Notifications (tied to a shared
account already, a smaller residual leak, fixing it properly means
making `buildNotification` async and touching its call sites everywhere,
a bigger change than this one), and the Training Simulator (fixed,
pre-authored content, not the "logged tickets" surface this was actually
about).

**A real, separate bug found along the way:** testing this required
creating fresh incidents, which immediately failed with a ticket-number
collision. `count() + 1` for the next `INC`/`PRB`/`CHG` number breaks the
moment any row has ever been deleted, exactly the class of bug this
project's own build log already flagged once (Stage 24), but that fix
only ever went into a one-off cleanup script, never into the actual
`createIncident`/`createProblem`/`createChange`/`generateIncomingTickets`
actions themselves. Fixed properly this time, in one shared
`src/lib/sequential-number.ts` helper used by all four, deriving the
next number from the highest one that actually exists instead of a row
count.

Verified with two entirely separate, cookie-isolated browser contexts
standing in for two real strangers, against the live database: visitor
A logged an incident, then switched to Manager in the *same* browser and
still saw it; visitor B, a fresh context, signed into the exact same
shared Jordan Lee and Manager accounts and saw neither that incident nor
found it in Search, while still seeing every pre-existing baseline
ticket normally; guessing visitor A's incident URL directly from
visitor B's browser 404'd. Repeated the create-then-check-from-a-
stranger's-browser pattern for a standalone Problem, a standalone
Change, and a "Simulate new tickets arriving" batch, all came back
correctly private. All test data from this pass, identifiable as
literally everything with a non-null `demoSessionId`, was deleted from
the live database afterward.

---

## Stage 31: Written-response feedback, three real usability fixes

Direct feedback on the written-response grading feature, three separate
small things, each real:

**The "Get feedback" button had no hover state.** A plain oversight,
`className` never included a `hover:` variant at all, so clicking it
felt like clicking into a void even before the request went out. Fixed
with a visible border/background hover, matching the tone/highlight
style already used on outlined buttons elsewhere in the app.

**No way to tell grading was actually working.** Every other action in
this app is fast enough that a full page re-render is feedback enough,
but an LLM round trip is not that fast, and a form that just sits there
for several seconds looks broken, not busy. Fixed with a small,
deliberate exception to this app's usual zero-client-JS approach: a new
`src/components/submit-button.tsx`, a Client Component using React's
`useFormStatus`, the one hook built exactly for "is the form I'm inside
of currently submitting." Shows "Getting feedback..." and disables
itself while the request is in flight. Same "small client component
just for the interactive bit" pattern `login-form.tsx` already
established, not a new precedent.

**The feedback never showed what a good answer actually looks like.**
Score plus strengths plus improvements tells you how you did, but not
concretely what "better" would have read like. Added a fourth field to
the same grading call, `exemplarAnswer`, generated by the same request
that already produces the score (not a second API call), and now shown
as a fourth box, "A strong answer would sound like."

**That last change came with a real cost worth being honest about:**
asking the model to also write a full exemplar paragraph roughly
quadrupled response time in testing, one run took over 30 seconds. The
loading indicator above absorbs a lot of that, "Getting feedback..." is
a real, honest state, not a lie while something's stuck, but 30 seconds
is still too long. Compared `gemini-3.6-flash` (previously in use)
against `gemini-3.1-flash-lite` head to head with the same prompt: near
identical grading quality, meaningfully faster, so this stage also
switched the model. Tried `thinkingConfig: { thinkingBudget: 0 }` first,
a documented way to skip a model's extended-thinking pass entirely, it
returned a 400 on this model, not available here, so the model swap is
what actually did the work.

Verified against the live database with a real browser: screenshotted
the button at rest and mid-hover to confirm the highlight actually
renders, clicked it and screenshotted within 200ms to confirm "Getting
feedback..." shows immediately rather than a frozen-looking button,
and let a full grading round trip complete to confirm the exemplar
answer box renders with genuinely specific, scenario-relevant content,
not a generic placeholder. All test attempts from this pass were
deleted from the database afterward.

---

---

## Stage 32: Actually walking through it as a learner

Every stage so far had been verified by testing the one thing that
stage built. This one was different on purpose: sign in as a first-time
visitor with no prior context, click through the app the way someone
actually trying to learn IT support would, and see what that person
would actually run into. Found four real things, none of them things a
targeted feature test would have caught, because none of them were
about whether a button worked.

**The escalation target label was reading from the wrong field.**
`app/incidents/[id]/page.tsx` was computing "Escalate to..." off
`incident.assignee?.role`, but escalating an incident clears its
assignee (that's how the queue hands the ticket to the next tier), so
after any escalation at all that field is always `null`, and the label
silently fell back to always showing "Escalate to L1 Agent," regardless
of how far up the chain the ticket actually was. The server-side
escalation logic itself was never wrong, it already reads
`incident.currentTier`, the field that survives escalation, same as
`getNextTier` expects. Only the display label was reading the wrong
source. This one matters more than a typical cosmetic bug: "escalation
only ever moves up, never back down" is one of the core ITIL lessons
this app exists to teach, and the UI was contradicting its own backend
on exactly that point. Fixed by reading `currentTier` in the label too.
Verified with a fresh ticket (correctly showed "Escalate to L2 Agent")
escalated once (correctly advanced to "Escalate to L3 Agent," not back
to L1).

**Problem and Change Management had zero example content anywhere.**
Unlike Incidents, `prisma/seed.ts` never actually created a single
Problem or Change row, so both `/problems` and `/changes` loaded as a
bare list with nothing in it on a fresh clone or a freshly cleaned
database, no worked example for a first-time visitor to learn the
workflow from. Added one full example of each to the seed script: a
Problem (`PRB000001`, linked to the existing "Card payment terminals
down" incident, taken by an agent, given a recorded workaround, so its
status is `KNOWN_ERROR`) and a Change (`CHG000001`, sourced from that
same Problem, requested, approved, implemented, and completed), each
with a proper activity trail so the history reads like something that
actually happened rather than a row that materialized fully formed.
Also added a one-paragraph explainer box to both `/problems` and
`/changes`, matching the style already used on the home dashboard,
since both pages previously assumed the visitor already knew what a
Problem or a Change was for.

**The login page pointed nowhere in particular.** A first-time visitor
lands on `/login` and sees five demo accounts with no indication of
which one to start with or why. Added a short paragraph pointing
new visitors toward two concrete starting points: Training, for
graded practice calls, or signing in as the Customer to log a real
problem and then switching to the L1 Agent to work that same ticket
themselves.

**The shared demo personas' Training Simulator history was polluted
with testing residue.** Every attempt, shift, and written response
logged against Jordan Lee, Casey Kim, and the rest during this entire
session's testing was still sitting in the live database, so a real
visitor signing into those same shared accounts would see a training
history that wasn't theirs and wasn't real. Deleted all of it, confirmed
zero attempts, shifts, or written responses remain.

Verified all four with Playwright against the rebuilt app: the
escalation label change (as above), both explainer boxes and both
seeded records rendering correctly, and the training page reading
"You've correctly resolved 0 of 12 calls" again for a clean sign-in.

---

## Stage 33: Service Request Management, the fourth ITIL process

With Incident, Problem, and Change all built, the natural next process
was **Service Request Management**: a formal, routine ask for something,
new hardware, a software install, access to a folder, a password reset,
as opposed to an Incident, which is something broken. Distinct enough
from Incident Management that conflating the two is itself a common
real-world mistake, and directly relevant to the internal-IT,
hardware/access-request work this project already set out to simulate.

**Customer-facing, unlike Problem/Change.** Anyone signed in can submit a
request, the requester is whoever asked, same as Incident. `/requests`
uses one role-scoped `WHERE` clause (customer sees only their own,
agents and managers see everything) rather than three separate rendered
views, the same shape `app/incidents/page.tsx` already established for
its own search page.

**A small service catalog, not a blank form by default.** Real ITIL
service catalogs list a fixed menu of things IT already knows how to
fulfill, each with its terms already decided. `src/data/service-request-
catalog.ts` holds eight of these (password reset, VPN access, a new
starter's laptop, and so on), each pre-classified as either
**pre-approved** or **needs a manager's sign-off**, the actual ITIL
distinction this feature exists to teach. Picking one from `/requests`
pre-fills the form via a plain `?catalog=slug` query param, the same
server-rendered pre-fill pattern already used for "raise a problem from
this incident" and "raise a change from this problem", no client-side
JavaScript involved. Describing something outside the catalog is still
allowed, but defaults to needing approval, since only a pre-approved,
named ask gets to skip that step.

**A third variant of "does this need sign-off first."** Incident has
tiered escalation. Change has Standard/Normal/Emergency. Service Request
adds a third shape of the same underlying ITIL question: `STANDARD`
requests go straight from `SUBMITTED` to the shared fulfillment queue;
`APPROVAL_REQUIRED` requests sit in `PENDING_APPROVAL` until a manager
decides. Deliberately no emergency-request equivalent, by ITIL
definition a request is never urgent break/fix work, that's what
Incident is for. Also deliberately no L1/L2/L3 tier ladder: real service
desks fulfill routine requests directly rather than escalating them
through the same skill tiers used for troubleshooting an actual fault,
the same reasoning Problem's single nullable owner already uses instead
of duplicating Incident's ladder.

Seeded two worked examples the same way Problem/Change got theirs last
stage, rather than shipping this feature with an empty list again: one
`STANDARD` request walked all the way through submit → take → fulfill →
close, and one `APPROVAL_REQUIRED` request left sitting in
`PENDING_APPROVAL`, so a fresh Manager sign-in sees a real "Awaiting
approval" queue on day one, not an empty one.

Verified end-to-end with Playwright across three personas in the same
browser context (a customer submitting both a catalog and a custom
request, a manager approving one and seeing the seeded one waiting, an
agent taking and fulfilling one, the customer closing it) plus a second,
separate context confirming per-visitor sandboxing holds for this new
model too: a stranger signing into the same shared Customer account
can't see the first visitor's private request in their list, and
guessing its URL directly 404s, while the seeded baseline catalog and
examples stay visible to both. Two false negatives during this pass
turned out to be the test script's own fault, not the app's: waiting for
literal text "APPROVED"/"FULFILLED" resolved instantly because that
exact substring already existed elsewhere on the page before the click
(the approval panel's own "pre-approved catalog" explainer copy, and the
"Mark fulfilled" button's own label), fixed by waiting for something
that actually only appears after the real state change instead.

*(Next stages get appended below as they're built.)*
