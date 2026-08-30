-- AlterEnum
ALTER TYPE "SourceKey" ADD VALUE 'todoist';

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "description" TEXT,
    "url" TEXT,
    "projectId" TEXT,
    "projectName" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 1,
    "labels" TEXT[],
    "dueDate" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3),
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "seenAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Task_externalId_key" ON "Task"("externalId");

-- CreateIndex
CREATE INDEX "Task_dueDate_idx" ON "Task"("dueDate");
