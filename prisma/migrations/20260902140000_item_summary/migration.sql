-- AlterTable
--
-- Additive and nullable: every existing row stays valid, and the cache simply
-- starts empty. Nothing backfills it — a summary is generated when Vincent asks
-- for one, and only then.
ALTER TABLE "Item" ADD COLUMN "summary" TEXT;
ALTER TABLE "Item" ADD COLUMN "summarisedAt" TIMESTAMP(3);
