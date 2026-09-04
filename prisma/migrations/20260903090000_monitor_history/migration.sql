-- AlterTable
--
-- Both additive. `certDays` is nullable and stays null for every monitor with
-- no certificate, which the page must render as "no certificate" rather than
-- as one expiring today.
--
-- `watchedSince` defaults to now(), so every existing row is stamped with the
-- moment of this migration. That is not a fallback — it is the truth: Steward
-- has no outage history from before this table existed, and an uptime figure
-- claiming to cover a month it did not watch would be the exact failure rule 2
-- is for.
ALTER TABLE "Monitor" ADD COLUMN "certDays" INTEGER;
ALTER TABLE "Monitor" ADD COLUMN "watchedSince" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
--
-- No foreign key to "Monitor" on purpose: housekeeping deletes a monitor
-- unseen for thirty days, and a cascade would take its outage history with it.
CREATE TABLE "MonitorOutage" (
    "id" TEXT NOT NULL,
    "monitor" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "MonitorOutage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MonitorOutage_monitor_startedAt_idx" ON "MonitorOutage"("monitor", "startedAt");
