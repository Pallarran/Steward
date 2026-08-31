-- AlterEnum
--
-- Alone, as every enum value in this project has been: Postgres will not let a
-- transaction use a value it added in that same transaction.
--
-- The machine itself, as distinct from `unraid`, which is the array. Two
-- sources on one box: /proc for what the OS is doing, and the BMC over Redfish
-- for what the hardware is doing.
ALTER TYPE "SourceKey" ADD VALUE 'server';
