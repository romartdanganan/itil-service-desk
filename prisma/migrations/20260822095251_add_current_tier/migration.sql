-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Incident" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticketNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "impact" TEXT NOT NULL,
    "urgency" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "requesterId" TEXT NOT NULL,
    "assigneeId" TEXT,
    "currentTier" TEXT NOT NULL DEFAULT 'AGENT_L1',
    "slaResponseDueAt" DATETIME NOT NULL,
    "slaResolveDueAt" DATETIME NOT NULL,
    "slaBreached" BOOLEAN NOT NULL DEFAULT false,
    "resolutionNotes" TEXT,
    "resolvedAt" DATETIME,
    "closedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Incident_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Incident_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Incident" ("assigneeId", "category", "closedAt", "createdAt", "description", "id", "impact", "priority", "requesterId", "resolutionNotes", "resolvedAt", "slaBreached", "slaResolveDueAt", "slaResponseDueAt", "status", "ticketNumber", "title", "updatedAt", "urgency") SELECT "assigneeId", "category", "closedAt", "createdAt", "description", "id", "impact", "priority", "requesterId", "resolutionNotes", "resolvedAt", "slaBreached", "slaResolveDueAt", "slaResponseDueAt", "status", "ticketNumber", "title", "updatedAt", "urgency" FROM "Incident";
DROP TABLE "Incident";
ALTER TABLE "new_Incident" RENAME TO "Incident";
CREATE UNIQUE INDEX "Incident_ticketNumber_key" ON "Incident"("ticketNumber");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
