-- CreateEnum
CREATE TYPE "ChangeType" AS ENUM ('STANDARD', 'NORMAL', 'EMERGENCY');

-- CreateEnum
CREATE TYPE "ChangeRisk" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "ChangeStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ChangeActivityType" AS ENUM ('CREATED', 'APPROVED', 'REJECTED', 'STARTED', 'COMPLETED', 'FAILED', 'CLOSED', 'COMMENT');

-- CreateTable
CREATE TABLE "Change" (
    "id" TEXT NOT NULL,
    "changeNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" "IncidentCategory" NOT NULL,
    "changeType" "ChangeType" NOT NULL,
    "risk" "ChangeRisk" NOT NULL,
    "implementationPlan" TEXT NOT NULL,
    "backoutPlan" TEXT NOT NULL,
    "plannedStart" TIMESTAMP(3) NOT NULL,
    "plannedEnd" TIMESTAMP(3) NOT NULL,
    "status" "ChangeStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvalNotes" TEXT,
    "implementedById" TEXT,
    "postImplementationNotes" TEXT,
    "completedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "sourceProblemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Change_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChangeActivity" (
    "id" TEXT NOT NULL,
    "changeId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "type" "ChangeActivityType" NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChangeActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Change_changeNumber_key" ON "Change"("changeNumber");

-- AddForeignKey
ALTER TABLE "Change" ADD CONSTRAINT "Change_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Change" ADD CONSTRAINT "Change_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Change" ADD CONSTRAINT "Change_implementedById_fkey" FOREIGN KEY ("implementedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Change" ADD CONSTRAINT "Change_sourceProblemId_fkey" FOREIGN KEY ("sourceProblemId") REFERENCES "Problem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeActivity" ADD CONSTRAINT "ChangeActivity_changeId_fkey" FOREIGN KEY ("changeId") REFERENCES "Change"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChangeActivity" ADD CONSTRAINT "ChangeActivity_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
