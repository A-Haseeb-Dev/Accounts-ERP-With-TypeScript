-- Per-party post-dated cheque (PDC) accounts
ALTER TABLE "Customer" ADD COLUMN "pdcAccountId" TEXT;
ALTER TABLE "Supplier" ADD COLUMN "pdcAccountId" TEXT;
ALTER TABLE "PaymentEntry" ADD COLUMN "pdcAccountId" TEXT;

CREATE INDEX "PaymentEntry_pdcAccountId_idx" ON "PaymentEntry"("pdcAccountId");

ALTER TABLE "Customer" ADD CONSTRAINT "Customer_pdcAccountId_fkey" FOREIGN KEY ("pdcAccountId") REFERENCES "MainAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_pdcAccountId_fkey" FOREIGN KEY ("pdcAccountId") REFERENCES "MainAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PaymentEntry" ADD CONSTRAINT "PaymentEntry_pdcAccountId_fkey" FOREIGN KEY ("pdcAccountId") REFERENCES "MainAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;