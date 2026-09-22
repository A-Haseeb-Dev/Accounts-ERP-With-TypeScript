-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "commission" DECIMAL(18,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Purchase" ADD COLUMN     "commission" DECIMAL(18,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "mainAccountId" TEXT;

-- CreateIndex
CREATE INDEX "Employee_mainAccountId_idx" ON "Employee"("mainAccountId");

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_mainAccountId_fkey" FOREIGN KEY ("mainAccountId") REFERENCES "MainAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;