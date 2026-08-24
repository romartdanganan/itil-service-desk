-- AlterTable
ALTER TABLE "TrainingScenario" ADD COLUMN     "writtenPrompt" TEXT;

-- CreateTable
CREATE TABLE "WrittenResponse" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "strengths" TEXT NOT NULL,
    "improvements" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WrittenResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WrittenResponse_attemptId_key" ON "WrittenResponse"("attemptId");

-- AddForeignKey
ALTER TABLE "WrittenResponse" ADD CONSTRAINT "WrittenResponse_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "TrainingAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
