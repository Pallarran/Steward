-- AlterEnum
--
-- On its own again: Postgres will not let a transaction use an enum value it
-- added in that same transaction.
ALTER TYPE "SourceKey" ADD VALUE 'family';
