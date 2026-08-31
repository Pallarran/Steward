-- AlterEnum
--
-- Alone, as every enum value in this project has been: Postgres will not let a
-- transaction use a value it added in that same transaction.
ALTER TYPE "ItemCategory" ADD VALUE 'people';
