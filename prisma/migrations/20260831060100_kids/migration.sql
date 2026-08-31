-- CreateTable
CREATE TABLE "Kid" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "planTitle" TEXT,
    "planDate" TIMESTAMP(3),
    "lastOutingAt" TIMESTAMP(3),
    "cadenceDays" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Kid_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Kid_position_idx" ON "Kid"("position");

-- AlterTable
ALTER TABLE "Idea" ADD COLUMN     "kidId" TEXT;

-- CreateIndex
CREATE INDEX "Idea_kidId_idx" ON "Idea"("kidId");

-- AddForeignKey
ALTER TABLE "Idea" ADD CONSTRAINT "Idea_kidId_fkey" FOREIGN KEY ("kidId") REFERENCES "Kid"("id") ON DELETE CASCADE ON UPDATE CASCADE;
