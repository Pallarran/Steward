-- AlterTable
--
-- Additive and nullable, so every existing row stays valid and the column can
-- be added without a rewrite or a lock worth worrying about.
ALTER TABLE "Item" ADD COLUMN "detail" JSONB;
