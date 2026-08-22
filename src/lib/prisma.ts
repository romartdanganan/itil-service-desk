import { PrismaClient } from "@/app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

// Prisma 7 dropped its built-in database engine binaries in favour of
// "driver adapters" — a small package per database that does the actual
// TCP talking, which Prisma Client then wraps with type safety. We have
// to construct one ourselves and hand it to PrismaClient; there's no more
// "just pass a connection string and it works" default. `pg.Pool` (not a
// single Client) is what makes this safe to reuse across concurrent
// requests — each request borrows a connection from the pool instead of
// fighting over one shared socket.
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);

// Next.js hot-reloads server code on every save in dev mode. Without this
// guard, each reload would run this module fresh and construct a brand new
// PrismaClient — and each one opens its own pool of database connections
// that never gets closed, until the dev server runs out of connections.
// Stashing the instance on `globalThis` (which survives hot reloads, unlike
// a plain module-level variable in some setups) means we reuse one client
// for the lifetime of the dev process. In production this file is only
// ever imported once, so the guard is a no-op there.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
