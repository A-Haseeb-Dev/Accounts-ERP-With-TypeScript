-- AlterTable
ALTER TABLE "MainAccount" ADD COLUMN     "openingBalanceType" TEXT NOT NULL DEFAULT 'DR';

-- AlterTable
ALTER TABLE "Purchase" ADD COLUMN     "paidAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "payStatus" TEXT NOT NULL DEFAULT 'unpaid',
ADD COLUMN     "rejectReason" TEXT,
ADD COLUMN     "rejectedAt" TIMESTAMP(3),
ADD COLUMN     "rejectedById" TEXT,
ADD COLUMN     "submittedAt" TIMESTAMP(3),
ADD COLUMN     "submittedById" TEXT;

-- AlterTable
ALTER TABLE "PurchaseReturn" ADD COLUMN     "rejectReason" TEXT,
ADD COLUMN     "rejectedAt" TIMESTAMP(3),
ADD COLUMN     "rejectedById" TEXT,
ADD COLUMN     "submittedAt" TIMESTAMP(3),
ADD COLUMN     "submittedById" TEXT;

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "rejectReason" TEXT,
ADD COLUMN     "rejectedAt" TIMESTAMP(3),
ADD COLUMN     "rejectedById" TEXT,
ADD COLUMN     "submittedAt" TIMESTAMP(3),
ADD COLUMN     "submittedById" TEXT;

-- AlterTable
ALTER TABLE "SalesReturn" ADD COLUMN     "rejectReason" TEXT,
ADD COLUMN     "rejectedAt" TIMESTAMP(3),
ADD COLUMN     "rejectedById" TEXT,
ADD COLUMN     "submittedAt" TIMESTAMP(3),
ADD COLUMN     "submittedById" TEXT;

-- AlterTable
ALTER TABLE "StockTransfer" ADD COLUMN     "rejectReason" TEXT,
ADD COLUMN     "rejectedAt" TIMESTAMP(3),
ADD COLUMN     "rejectedById" TEXT,
ADD COLUMN     "submittedAt" TIMESTAMP(3),
ADD COLUMN     "submittedById" TEXT;

-- AlterTable
ALTER TABLE "Voucher" ADD COLUMN     "rejectReason" TEXT,
ADD COLUMN     "rejectedAt" TIMESTAMP(3),
ADD COLUMN     "rejectedById" TEXT,
ADD COLUMN     "submittedAt" TIMESTAMP(3),
ADD COLUMN     "submittedById" TEXT;

-- CreateTable
CREATE TABLE "PaymentEntry" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "paymentType" TEXT NOT NULL,
    "partyType" TEXT NOT NULL,
    "partyId" TEXT NOT NULL,
    "partyName" TEXT,
    "mainAccountId" TEXT NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'CASH',
    "chequeNumber" TEXT,
    "amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "paymentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reference" TEXT,
    "narration" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "voucherId" TEXT,
    "postedById" TEXT,
    "postedAt" TIMESTAMP(3),
    "rejectedById" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "cancelledById" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdById" TEXT,
    "organizationId" TEXT NOT NULL DEFAULT 'default-org',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAllocation" (
    "id" TEXT NOT NULL,
    "paymentEntryId" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "allocatedAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,

    CONSTRAINT "PaymentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaymentEntry_paymentType_paymentDate_idx" ON "PaymentEntry"("paymentType", "paymentDate");

-- CreateIndex
CREATE INDEX "PaymentEntry_partyId_idx" ON "PaymentEntry"("partyId");

-- CreateIndex
CREATE INDEX "PaymentEntry_status_idx" ON "PaymentEntry"("status");

-- CreateIndex
CREATE INDEX "PaymentEntry_mainAccountId_idx" ON "PaymentEntry"("mainAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentEntry_number_organizationId_key" ON "PaymentEntry"("number", "organizationId");

-- CreateIndex
CREATE INDEX "PaymentAllocation_documentType_documentId_idx" ON "PaymentAllocation"("documentType", "documentId");

-- CreateIndex
CREATE INDEX "PaymentAllocation_paymentEntryId_idx" ON "PaymentAllocation"("paymentEntryId");

-- AddForeignKey
ALTER TABLE "PaymentEntry" ADD CONSTRAINT "PaymentEntry_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentEntry" ADD CONSTRAINT "PaymentEntry_mainAccountId_fkey" FOREIGN KEY ("mainAccountId") REFERENCES "MainAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_paymentEntryId_fkey" FOREIGN KEY ("paymentEntryId") REFERENCES "PaymentEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
