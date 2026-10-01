-- CreateTable
CREATE TABLE "Purchase" (
    "id" TEXT NOT NULL,
    "learnerId" TEXT NOT NULL,
    "store" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "amazonUserId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "termSku" TEXT,
    "purchaseDate" TIMESTAMP(3) NOT NULL,
    "cancelDate" TIMESTAMP(3),
    "renewalDate" TIMESTAMP(3),
    "testTransaction" BOOLEAN NOT NULL,
    "verifiedAt" TIMESTAMP(3) NOT NULL,
    "raw" JSONB NOT NULL,

    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_receiptId_key" ON "Purchase"("receiptId");

-- CreateIndex
CREATE INDEX "Purchase_learnerId_idx" ON "Purchase"("learnerId");

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "Learner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
