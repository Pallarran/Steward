-- AlterEnum
--
-- Alone again: Postgres will not let a transaction use an enum value it added
-- in that same transaction, and Prisma runs each migration in one.
ALTER TYPE "SourceKey" ADD VALUE 'subscriptions';
