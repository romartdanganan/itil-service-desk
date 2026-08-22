-- CreateEnum
CREATE TYPE "TrainingDifficulty" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED');

-- CreateTable
CREATE TABLE "TrainingScenario" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" "IncidentCategory" NOT NULL,
    "difficulty" "TrainingDifficulty" NOT NULL DEFAULT 'BEGINNER',
    "callerOpening" TEXT NOT NULL,
    "callerFollowUp" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "resolutionSteps" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainingScenario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingChoice" (
    "id" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL DEFAULT false,
    "explanation" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TrainingChoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingAttempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "choiceId" TEXT NOT NULL,
    "wasCorrect" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainingAttempt_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "TrainingChoice" ADD CONSTRAINT "TrainingChoice_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "TrainingScenario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingAttempt" ADD CONSTRAINT "TrainingAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingAttempt" ADD CONSTRAINT "TrainingAttempt_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "TrainingScenario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingAttempt" ADD CONSTRAINT "TrainingAttempt_choiceId_fkey" FOREIGN KEY ("choiceId") REFERENCES "TrainingChoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
