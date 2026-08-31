-- CreateEnum
CREATE TYPE "SlotStatus" AS ENUM ('open', 'planning', 'booked', 'done');

-- CreateTable
CREATE TABLE "CoupleSlot" (
    "id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "planner" TEXT NOT NULL,
    "title" TEXT,
    "detail" TEXT,
    "status" "SlotStatus" NOT NULL DEFAULT 'open',
    "eventDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoupleSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Idea" (
    "id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "notes" TEXT,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Idea_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CoupleSlot_month_key" ON "CoupleSlot"("month");

-- CreateIndex
CREATE INDEX "CoupleSlot_status_idx" ON "CoupleSlot"("status");

-- CreateIndex
CREATE INDEX "Idea_usedAt_idx" ON "Idea"("usedAt");
