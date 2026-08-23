# Deployment

How this project goes from "runs on my machine" to a live URL. Written
as it's actually done, stage by stage — same spirit as `BUILD_LOG.md`.

## Why Prisma Postgres + Vercel, not SQLite-as-is

Local development uses SQLite (a single file, zero setup, perfect for
"clone and run"). That doesn't carry over to most serverless hosts —
Vercel's filesystem is ephemeral and read-only at runtime, so a SQLite
file written to disk during one request wouldn't exist for the next one.

Two real options exist: host somewhere with a persistent disk (e.g.
Railway, Fly.io, Render) and keep SQLite as-is, or switch the database to
something serverless-friendly and deploy to Vercel. This project takes
the second path — **Prisma Postgres + Vercel** — for two reasons:

1. **Postgres is the honest "production" answer.** SQLite works safely
   with exactly one process writing to the file; that's fine for local
   dev, but is worth being upfront about if it comes up as "why would you
   run this in production as-is" in an interview. Postgres is the
   database a real team would actually deploy.
2. **Vercel is what most people who look at a Next.js portfolio project
   will recognize.** A live URL beats "clone and run `npm install`."

## Stage D1 — Provisioning Prisma Postgres

Requires a Prisma Postgres account (console.prisma.io) — the author's
account, not something this repo or an agent working on it can create.
Steps:

1. Create a database at console.prisma.io (free tier).
2. Copy its connection string into a local `.env` as `DATABASE_URL`.
   `.env` is gitignored — this secret is never committed, and was never
   pasted into any AI conversation either; it was added directly to the
   local file.

## Stage D2 — Switching the codebase from SQLite to PostgreSQL

Everything below happens once `DATABASE_URL` points at a real Postgres
database. This was a genuine "swap the database provider" migration, not
just a config toggle — six things had to change together:

1. **`prisma/schema.prisma`** — `datasource db { provider = "sqlite" }`
   → `provider = "postgresql"`.
2. **Driver adapter** — Prisma 7 requires a driver adapter no matter the
   database (see `docs/BUILD_LOG.md` Stage 3). Swapped
   `@prisma/adapter-better-sqlite3` for `@prisma/adapter-pg` (+ the `pg`
   driver package) in both `src/lib/prisma.ts` and `prisma/seed.ts`. The
   Postgres adapter takes a `pg.Pool`, not a single connection — the pool
   is what lets multiple concurrent requests share connections safely
   instead of fighting over one socket, which matters a lot more for a
   real server than it did for a local SQLite file.
3. **Migration history** — the existing migrations were SQLite-specific
   SQL (`RENAME COLUMN` syntax, SQLite type affinities) and don't apply to
   Postgres. Deleted `prisma/migrations/` and generated a fresh baseline
   with `prisma migrate dev --name init` against the real Postgres
   database — the standard approach when switching a schema's underlying
   provider.
4. **`postinstall` script** — added `"postinstall": "prisma generate"` to
   `package.json`. The generated client (`app/generated/prisma/`) is
   gitignored, so a fresh `npm install` — including Vercel's build step —
   needs to regenerate it itself rather than relying on a committed copy.
5. **Removed the SQLite dependencies** — `@prisma/adapter-better-sqlite3`
   and `better-sqlite3` (a native module requiring a compiled binary) are
   no longer used anywhere.
6. **A real cross-database bug, caught before it shipped:** the search
   page's `contains` filter (`app/incidents/page.tsx`) relied on SQLite's
   default case-insensitive `LIKE` — searching `"drive"` matched `"...
   shared drive"` and this looked correct in every earlier test.
   PostgreSQL's `LIKE` is case-sensitive by default, so the exact same
   query with `"DRIVE"` silently returned zero results once the database
   switched. Verified the regression by testing the mixed-case query
   directly against the new Postgres database, then fixed it by adding
   Prisma's `mode: "insensitive"` to all three search fields
   (`ticketNumber`, `title`, `description`). This is exactly the kind of
   bug that a type-checker or a green test suite doesn't catch — provider
   defaults are a runtime behavior, not a type — which is why it was
   worth actually running the search feature against the real new
   database with a deliberately-mismatched-case query rather than
   assuming "it worked on SQLite, it'll work on Postgres."

Verified end-to-end after the switch: seeded the new database, ran the
full take → escalate → resolve → close lifecycle against it directly (not
through the UI — a script exercising the same Prisma calls the Server
Actions make), confirmed the dashboard/detail/search pages all render
correctly reading from Postgres, re-ran the full Vitest suite (unaffected
— those tests exercise pure functions with no database dependency), and
ran a real production build (`npm run build` — the exact command Vercel
runs) followed by `npm start` to confirm the compiled app serves
correctly, not just the dev server.

## Stage D3 — Deploying to Vercel

This part happens in the author's own Vercel account (vercel.com) — no
CLI token needed from anyone else, since Vercel's GitHub integration
handles auth through the browser:

1. Sign in to Vercel, click **Add New → Project**, and import
   `romartdanganan/itil-service-desk` from GitHub. Vercel auto-detects
   Next.js and fills in the build settings — nothing to change there.
2. In the project's **Environment Variables** settings, add
   `DATABASE_URL` with the same Prisma Postgres connection string from
   Stage D1 (production, preview, and development environments can all
   point at the same database for a solo portfolio project — a team
   project would want separate databases per environment), and add
   `SESSION_SECRET` — generate it fresh with `openssl rand -base64 32`
   **run locally and pasted directly into Vercel's dashboard**, not the
   same value as local dev's `.env`. This is what signs every session
   cookie; without it set, login and signup fail immediately (anonymous
   browsing/redirects to `/login` still work, since those never need to
   sign anything).
3. Deploy. Vercel runs `npm install` (which triggers the `postinstall`
   → `prisma generate` step from Stage D2), then `next build`.
4. Every future push to `main` auto-deploys — no separate deploy step
   needed after this one-time setup.

**Live at: [itil-service-desk.vercel.app](https://itil-service-desk.vercel.app/)**

Verified live, not just "the deploy succeeded": fetched the home page,
`/incidents` (search), and `/incidents/new` and confirmed all three
return `200` and the home page renders real seeded data (e.g. "Card
payment terminals down store-wide") pulled from the production Postgres
database, not a cached or stale build.
