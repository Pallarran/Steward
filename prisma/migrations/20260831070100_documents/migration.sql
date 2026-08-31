-- CreateEnum
CREATE TYPE "SubscriptionCadence" AS ENUM ('weekly', 'monthly', 'quarterly', 'yearly');

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CAD',
    "cadence" "SubscriptionCadence" NOT NULL DEFAULT 'monthly',
    "renewsOn" DATE NOT NULL,
    "card" TEXT,
    "cancelUrl" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "noticeDays" INTEGER DEFAULT 10,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheatSheetEntry" (
    "id" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "secret" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CheatSheetEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Subscription_active_idx" ON "Subscription"("active");

-- CreateIndex
CREATE INDEX "CheatSheetEntry_position_idx" ON "CheatSheetEntry"("position");
