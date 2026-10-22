-- AlterTable
ALTER TABLE "PayrollRun" ADD COLUMN     "settlementAccountId" TEXT;

-- AlterTable
ALTER TABLE "SaleItem" ADD COLUMN     "deliveredQuantity" DECIMAL(18,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "DeliveryOrder" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "deliveryDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "saleId" TEXT,
    "customerId" TEXT NOT NULL,
    "stockLocationId" TEXT NOT NULL,
    "reference" TEXT,
    "deliveryTo" TEXT,
    "vehicleNo" TEXT,
    "driverName" TEXT,
    "driverPhone" TEXT,
    "note" TEXT,
    "subtotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "grandTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "submittedById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "rejectedById" TEXT,
    "rejectedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "postedById" TEXT,
    "postedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdById" TEXT,
    "organizationId" TEXT NOT NULL DEFAULT 'default-org',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryOrderItem" (
    "id" TEXT NOT NULL,
    "deliveryOrderId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "unitPrice" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,

    CONSTRAINT "DeliveryOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Investor" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "cnic" TEXT,
    "address" TEXT,
    "mainAccountId" TEXT,
    "openingBalance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "organizationId" TEXT NOT NULL DEFAULT 'default-org',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Investor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Investment" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "investorId" TEXT NOT NULL,
    "principal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "termMonths" INTEGER NOT NULL DEFAULT 6,
    "returnType" TEXT NOT NULL DEFAULT 'FIXED',
    "monthlyReturn" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "profitSharePercent" DECIMAL(9,4) NOT NULL DEFAULT 0,
    "totalReturn" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "fundingAccountId" TEXT,
    "capitalAccountId" TEXT,
    "returnExpenseAccountId" TEXT,
    "receivedAt" TIMESTAMP(3),
    "receivedVoucherId" TEXT,
    "maturedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "closedVoucherId" TEXT,
    "note" TEXT,
    "createdById" TEXT,
    "organizationId" TEXT NOT NULL DEFAULT 'default-org',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Investment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvestmentInstallment" (
    "id" TEXT NOT NULL,
    "investmentId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 1,
    "kind" TEXT NOT NULL DEFAULT 'RETURN',
    "dueDate" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "paidAt" TIMESTAMP(3),
    "paidVoucherId" TEXT,
    "note" TEXT,
    "organizationId" TEXT NOT NULL DEFAULT 'default-org',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvestmentInstallment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryOrder_number_key" ON "DeliveryOrder"("number");

-- CreateIndex
CREATE INDEX "DeliveryOrder_deliveryDate_idx" ON "DeliveryOrder"("deliveryDate");

-- CreateIndex
CREATE INDEX "DeliveryOrder_status_idx" ON "DeliveryOrder"("status");

-- CreateIndex
CREATE INDEX "DeliveryOrder_saleId_idx" ON "DeliveryOrder"("saleId");

-- CreateIndex
CREATE INDEX "DeliveryOrder_customerId_idx" ON "DeliveryOrder"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryOrder_number_organizationId_key" ON "DeliveryOrder"("number", "organizationId");

-- CreateIndex
CREATE INDEX "DeliveryOrderItem_itemId_idx" ON "DeliveryOrderItem"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "Investor_code_key" ON "Investor"("code");

-- CreateIndex
CREATE INDEX "Investor_name_idx" ON "Investor"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Investor_code_organizationId_key" ON "Investor"("code", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Investment_number_key" ON "Investment"("number");

-- CreateIndex
CREATE INDEX "Investment_investorId_idx" ON "Investment"("investorId");

-- CreateIndex
CREATE INDEX "Investment_status_idx" ON "Investment"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Investment_number_organizationId_key" ON "Investment"("number", "organizationId");

-- CreateIndex
CREATE INDEX "InvestmentInstallment_dueDate_idx" ON "InvestmentInstallment"("dueDate");

-- CreateIndex
CREATE INDEX "InvestmentInstallment_status_idx" ON "InvestmentInstallment"("status");

-- CreateIndex
CREATE UNIQUE INDEX "InvestmentInstallment_investmentId_sequence_key" ON "InvestmentInstallment"("investmentId", "sequence");

-- AddForeignKey
ALTER TABLE "DeliveryOrder" ADD CONSTRAINT "DeliveryOrder_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryOrder" ADD CONSTRAINT "DeliveryOrder_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryOrder" ADD CONSTRAINT "DeliveryOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryOrder" ADD CONSTRAINT "DeliveryOrder_stockLocationId_fkey" FOREIGN KEY ("stockLocationId") REFERENCES "StockLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryOrder" ADD CONSTRAINT "DeliveryOrder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryOrderItem" ADD CONSTRAINT "DeliveryOrderItem_deliveryOrderId_fkey" FOREIGN KEY ("deliveryOrderId") REFERENCES "DeliveryOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryOrderItem" ADD CONSTRAINT "DeliveryOrderItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_settlementAccountId_fkey" FOREIGN KEY ("settlementAccountId") REFERENCES "MainAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Investor" ADD CONSTRAINT "Investor_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Investor" ADD CONSTRAINT "Investor_mainAccountId_fkey" FOREIGN KEY ("mainAccountId") REFERENCES "MainAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Investment" ADD CONSTRAINT "Investment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Investment" ADD CONSTRAINT "Investment_investorId_fkey" FOREIGN KEY ("investorId") REFERENCES "Investor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Investment" ADD CONSTRAINT "Investment_fundingAccountId_fkey" FOREIGN KEY ("fundingAccountId") REFERENCES "MainAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Investment" ADD CONSTRAINT "Investment_capitalAccountId_fkey" FOREIGN KEY ("capitalAccountId") REFERENCES "MainAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Investment" ADD CONSTRAINT "Investment_returnExpenseAccountId_fkey" FOREIGN KEY ("returnExpenseAccountId") REFERENCES "MainAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Investment" ADD CONSTRAINT "Investment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvestmentInstallment" ADD CONSTRAINT "InvestmentInstallment_investmentId_fkey" FOREIGN KEY ("investmentId") REFERENCES "Investment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
