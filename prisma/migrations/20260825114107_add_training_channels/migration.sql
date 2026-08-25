-- CreateEnum
CREATE TYPE "TrainingChannel" AS ENUM ('PHONE', 'EMAIL', 'CHAT');

-- AlterTable
ALTER TABLE "TrainingScenario" ADD COLUMN     "channel" "TrainingChannel" NOT NULL DEFAULT 'PHONE',
ADD COLUMN     "channelSubject" TEXT;
