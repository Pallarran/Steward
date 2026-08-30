-- CreateEnum
CREATE TYPE "MonitorStatus" AS ENUM ('down', 'up', 'pending', 'maintenance');

-- AlterTable
ALTER TABLE "SourceStatus" ADD COLUMN     "consecutiveFailures" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Monitor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT,
    "type" TEXT,
    "status" "MonitorStatus" NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL,
    "seenAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Monitor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Monitor_name_key" ON "Monitor"("name");

-- CreateIndex
CREATE INDEX "Monitor_status_idx" ON "Monitor"("status");
