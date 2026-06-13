-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "liveExternalId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Match_liveExternalId_key" ON "Match"("liveExternalId");
