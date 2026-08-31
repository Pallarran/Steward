-- CreateTable
CREATE TABLE "SystemFact" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "source" "SourceKey" NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemFact_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "SystemFact_source_idx" ON "SystemFact"("source");

-- The two facts that lived in Setting as JSON. Both are rewritten by the Home
-- Assistant collector every five minutes, so there is nothing to migrate —
-- only stale rows to clear out so they are not mistaken for live config.
DELETE FROM "Setting" WHERE "key" IN ('ha:unavailable', 'ha:updates');
