-- AlterTable: customer credit days (invoice due date default)
ALTER TABLE "Customer" ADD COLUMN "creditDays" INTEGER NOT NULL DEFAULT 30;

-- AlterTable: sales invoice due date
ALTER TABLE "Sale" ADD COLUMN "dueDate" TIMESTAMP(3);

-- CreateTable: BankAccount
CREATE TABLE "BankAccount" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "accountTitle" TEXT,
    "accountNumber" TEXT,
    "mainAccountId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "organizationId" TEXT NOT NULL DEFAULT 'default-org',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);

-- AlterTable: post-dated cheque fields on payment entries
ALTER TABLE "PaymentEntry" ADD COLUMN "bankAccountId" TEXT;
ALTER TABLE "PaymentEntry" ADD COLUMN "chequeDate" TIMESTAMP(3);
ALTER TABLE "PaymentEntry" ADD COLUMN "chequeStatus" TEXT;
ALTER TABLE "PaymentEntry" ADD COLUMN "depositedById" TEXT;
ALTER TABLE "PaymentEntry" ADD COLUMN "depositedAt" TIMESTAMP(3);
ALTER TABLE "PaymentEntry" ADD COLUMN "bouncedById" TEXT;
ALTER TABLE "PaymentEntry" ADD COLUMN "bouncedAt" TIMESTAMP(3);
ALTER TABLE "PaymentEntry" ADD COLUMN "bounceReason" TEXT;

-- Indexes
CREATE UNIQUE INDEX "BankAccount_organizationId_name_key" ON "BankAccount"("organizationId", "name");
CREATE INDEX "PaymentEntry_bankAccountId_idx" ON "PaymentEntry"("bankAccountId");
CREATE INDEX "PaymentEntry_chequeStatus_idx" ON "PaymentEntry"("chequeStatus");

-- Foreign keys
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_mainAccountId_fkey" FOREIGN KEY ("mainAccountId") REFERENCES "MainAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PaymentEntry" ADD CONSTRAINT "PaymentEntry_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;