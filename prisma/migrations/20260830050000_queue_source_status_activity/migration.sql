-- CreateEnum
CREATE TYPE "SourceKey" AS ENUM ('ha', 'rss', 'kuma', 'unraid', 'horizon', 'vault', 'gmail', 'capture');

-- CreateEnum
CREATE TYPE "ItemCategory" AS ENUM ('systems', 'school', 'couple', 'news', 'gaming', 'subscriptions', 'inbox');

-- CreateEnum
CREATE TYPE "ItemStatus" AS ENUM ('new', 'seen', 'dismissed');

-- CreateEnum
CREATE TYPE "ActivityKind" AS ENUM ('cleared', 'ticked', 'filed');

-- CreateTable
CREATE TABLE "Item" (
    "id" TEXT NOT NULL,
    "source" "SourceKey" NOT NULL,
    "externalId" TEXT NOT NULL,
    "category" "ItemCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "url" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "status" "ItemStatus" NOT NULL DEFAULT 'new',
    "dismissedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceStatus" (
    "source" "SourceKey" NOT NULL,
    "intervalSeconds" INTEGER NOT NULL,
    "lastSuccessAt" TIMESTAMP(3),
    "lastErrorAt" TIMESTAMP(3),
    "lastError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceStatus_pkey" PRIMARY KEY ("source")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "kind" "ActivityKind" NOT NULL,
    "points" INTEGER NOT NULL,
    "itemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Item_status_priority_idx" ON "Item"("status", "priority");

-- CreateIndex
CREATE INDEX "Item_expiresAt_idx" ON "Item"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Item_source_externalId_key" ON "Item"("source", "externalId");

-- CreateIndex
CREATE INDEX "Activity_createdAt_idx" ON "Activity"("createdAt");

-- CreateIndex
CREATE INDEX "Activity_itemId_idx" ON "Activity"("itemId");

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;
