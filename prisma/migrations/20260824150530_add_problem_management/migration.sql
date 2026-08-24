-- CreateEnum
CREATE TYPE "ProblemStatus" AS ENUM ('NEW', 'INVESTIGATING', 'KNOWN_ERROR', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ProblemActivityType" AS ENUM ('CREATED', 'ASSIGNED', 'WORKAROUND_RECORDED', 'RESOLVED', 'CLOSED', 'INCIDENT_LINKED', 'COMMENT');

-- AlterEnum
ALTER TYPE "ActivityType" ADD VALUE 'PROBLEM_LINKED';

-- AlterTable
ALTER TABLE "Incident" ADD COLUMN     "problemId" TEXT;

-- CreateTable
CREATE TABLE "Problem" (
    "id" TEXT NOT NULL,
    "problemNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" "IncidentCategory" NOT NULL,
    "impact" "Impact" NOT NULL,
    "urgency" "Urgency" NOT NULL,
    "priority" "Priority" NOT NULL,
    "status" "ProblemStatus" NOT NULL DEFAULT 'NEW',
    "ownerId" TEXT,
    "raisedById" TEXT NOT NULL,
    "workaround" TEXT,
    "workaroundAt" TIMESTAMP(3),
    "rootCause" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Problem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProblemActivity" (
    "id" TEXT NOT NULL,
    "problemId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "type" "ProblemActivityType" NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProblemActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Problem_problemNumber_key" ON "Problem"("problemNumber");

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Problem" ADD CONSTRAINT "Problem_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Problem" ADD CONSTRAINT "Problem_raisedById_fkey" FOREIGN KEY ("raisedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProblemActivity" ADD CONSTRAINT "ProblemActivity_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "Problem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProblemActivity" ADD CONSTRAINT "ProblemActivity_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
