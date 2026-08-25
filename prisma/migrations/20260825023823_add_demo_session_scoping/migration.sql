-- AlterTable
ALTER TABLE "Change" ADD COLUMN     "demoSessionId" TEXT;

-- AlterTable
ALTER TABLE "Incident" ADD COLUMN     "demoSessionId" TEXT;

-- AlterTable
ALTER TABLE "Problem" ADD COLUMN     "demoSessionId" TEXT;

-- CreateIndex
CREATE INDEX "Change_demoSessionId_idx" ON "Change"("demoSessionId");

-- CreateIndex
CREATE INDEX "Incident_demoSessionId_idx" ON "Incident"("demoSessionId");

-- CreateIndex
CREATE INDEX "Problem_demoSessionId_idx" ON "Problem"("demoSessionId");
