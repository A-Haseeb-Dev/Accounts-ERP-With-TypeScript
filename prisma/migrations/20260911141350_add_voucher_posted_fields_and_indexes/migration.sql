-- AlterTable
ALTER TABLE "Voucher" ADD COLUMN     "postedAt" TIMESTAMP(3),
ADD COLUMN     "postedById" TEXT;

-- CreateIndex
CREATE INDEX "Role_organizationId_idx" ON "Role"("organizationId");

-- CreateIndex
CREATE INDEX "SubHead_headAccountId_idx" ON "SubHead"("headAccountId");

-- CreateIndex
CREATE INDEX "SubHead_organizationId_idx" ON "SubHead"("organizationId");
