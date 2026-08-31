-- AlterEnum
--
-- Its own migration, for the same reason as the SourceKey values: Postgres will
-- not let a transaction use an enum value it added in that same transaction.
ALTER TYPE "ItemCategory" ADD VALUE 'family';
