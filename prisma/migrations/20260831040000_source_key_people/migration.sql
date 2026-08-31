-- AlterEnum
--
-- On its own, deliberately. Postgres will not let a transaction use an enum
-- value it added in that same transaction, and Prisma runs each migration in
-- one. Splitting the value from everything that might use it removes the
-- question entirely.
ALTER TYPE "SourceKey" ADD VALUE 'people';
