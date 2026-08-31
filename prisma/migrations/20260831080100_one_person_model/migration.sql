-- Folds `Kid` into `Person` — PRD components 5 and 8 becoming one.
--
-- **This migration removes things.** It drops the `Kid` table and deletes every
-- `Item` written by the retired `family` source. Read the two notes before the
-- statements that do it.
--
-- The order below is not arbitrary. Person rows must exist before Idea's
-- foreign key is re-pointed at them, or the constraint fails on every row.

-- CreateEnum
CREATE TYPE "PersonKind" AS ENUM ('spouse', 'child', 'contact');

-- AlterTable: Person gains what Kid had
ALTER TABLE "Person" ADD COLUMN     "kind" "PersonKind" NOT NULL DEFAULT 'contact',
                     ADD COLUMN     "circle" TEXT,
                     ADD COLUMN     "planTitle" TEXT,
                     ADD COLUMN     "planDate" TIMESTAMP(3);

-- Carry every girl across, **keeping her id**.
--
-- The id is what makes her ideas follow her: Idea.kidId already points at it,
-- so re-pointing that column at Person below needs no remapping. Kid.lastOutingAt
-- becomes Person.lastContactAt — the same question, "when did we last actually
-- spend time together", asked of a daughter rather than a friend.
INSERT INTO "Person" ("id", "name", "kind", "cadenceDays", "lastContactAt", "planTitle", "planDate", "position", "createdAt")
SELECT "id", "name", 'child', "cadenceDays", "lastOutingAt", "planTitle", "planDate", "position", "createdAt"
FROM "Kid";

-- Re-point Idea at Person. Drop first, rename, then add: renaming a column with
-- a live foreign key on it would leave the constraint pointing at a table that
-- is about to disappear.
ALTER TABLE "Idea" DROP CONSTRAINT "Idea_kidId_fkey";
ALTER TABLE "Idea" RENAME COLUMN "kidId" TO "personId";
ALTER TABLE "Idea" ADD CONSTRAINT "Idea_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DROP INDEX "Idea_kidId_idx";
CREATE INDEX "Idea_personId_idx" ON "Idea"("personId");

-- DropTable. Every row has been copied above; nothing here is unique to Kid.
DROP TABLE "Kid";

-- CreateIndex
CREATE INDEX "Person_kind_idx" ON "Person"("kind");

-- AlterTable: whose month it is, as a boolean rather than a name.
--
-- The existing rows store the literal strings "Vincent" and "Marylène". His
-- months become true; everything else is hers. The names now come from
-- User.displayName and the spouse record, so a rename cannot strand a month.
ALTER TABLE "CoupleSlot" ADD COLUMN "mine" BOOLEAN NOT NULL DEFAULT true;
UPDATE "CoupleSlot" SET "mine" = ("planner" = 'Vincent');
ALTER TABLE "CoupleSlot" ALTER COLUMN "mine" DROP DEFAULT;
ALTER TABLE "CoupleSlot" DROP COLUMN "planner";

-- The queue rows written by the retired `family` source.
--
-- Safe to delete because they are **derived, not authored**: the 07:00 sync
-- rebuilds every one of them from the couple slots and the children within a
-- day, and immediately on the next page action. The only thing lost is which
-- of them had been dismissed today, which is a day's worth of "not now".
DELETE FROM "Item" WHERE "source" = 'family';
