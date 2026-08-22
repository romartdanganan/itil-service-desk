-- Rename the ambiguous `slaBreached` (which SLA?) to `slaResolveBreached`,
-- and add first-response tracking (`respondedAt`, `slaResponseBreached`)
-- so the Response SLA gets the same permanent breached/met verdict the
-- Resolution SLA already had. Written by hand as a rename (not the
-- default drop+recreate) so the 4 existing rows keep their data.
ALTER TABLE "Incident" RENAME COLUMN "slaBreached" TO "slaResolveBreached";
ALTER TABLE "Incident" ADD COLUMN "respondedAt" DATETIME;
ALTER TABLE "Incident" ADD COLUMN "slaResponseBreached" BOOLEAN NOT NULL DEFAULT false;
