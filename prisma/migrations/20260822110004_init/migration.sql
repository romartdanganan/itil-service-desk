-- CreateEnum
CREATE TYPE "Role" AS ENUM ('CUSTOMER', 'AGENT_L1', 'AGENT_L2', 'AGENT_L3', 'MANAGER');

-- CreateEnum
CREATE TYPE "IncidentCategory" AS ENUM ('HARDWARE', 'SOFTWARE', 'NETWORK', 'ACCESS', 'ACCOUNT', 'OTHER');

-- CreateEnum
CREATE TYPE "Impact" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "Urgency" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('P1_CRITICAL', 'P2_HIGH', 'P3_MEDIUM', 'P4_LOW');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'ON_HOLD', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('CREATED', 'ASSIGNED', 'ESCALATED', 'STATUS_CHANGED', 'COMMENT', 'RESOLVED', 'CLOSED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'CUSTOMER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Incident" (
    "id" TEXT NOT NULL,
    "ticketNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" "IncidentCategory" NOT NULL,
    "impact" "Impact" NOT NULL,
    "urgency" "Urgency" NOT NULL,
    "priority" "Priority" NOT NULL,
    "status" "IncidentStatus" NOT NULL DEFAULT 'NEW',
    "requesterId" TEXT NOT NULL,
    "assigneeId" TEXT,
    "currentTier" "Role" NOT NULL DEFAULT 'AGENT_L1',
    "slaResponseDueAt" TIMESTAMP(3) NOT NULL,
    "respondedAt" TIMESTAMP(3),
    "slaResponseBreached" BOOLEAN NOT NULL DEFAULT false,
    "slaResolveDueAt" TIMESTAMP(3) NOT NULL,
    "slaResolveBreached" BOOLEAN NOT NULL DEFAULT false,
    "resolutionNotes" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncidentActivity" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "type" "ActivityType" NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncidentActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Incident_ticketNumber_key" ON "Incident"("ticketNumber");

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentActivity" ADD CONSTRAINT "IncidentActivity_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentActivity" ADD CONSTRAINT "IncidentActivity_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
