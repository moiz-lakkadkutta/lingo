-- AlterTable
ALTER TABLE "Review" ADD COLUMN     "reviewId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Review_savedWordId_reviewId_key" ON "Review"("savedWordId", "reviewId");

