-- AlterEnum
--
-- Alone, as every enum value in this project has been: Postgres will not let a
-- transaction use a value it added in that same transaction.
--
-- Mail is its own category rather than reusing `inbox`. `inbox` means Todoist's
-- Inbox — something Vincent chose to write down and has not triaged yet — and
-- an unread email is the opposite: somebody else's demand that arrived without
-- being asked for. They deserve different chips and they sort differently.
ALTER TYPE "ItemCategory" ADD VALUE 'mail';
