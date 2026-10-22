-- AlterTable
ALTER TABLE "DeliveryOrder" ADD COLUMN     "stockRelieved" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "DeliveryOrderItem" ADD COLUMN     "saleItemId" TEXT;

-- AlterTable
ALTER TABLE "SaleItem" ADD COLUMN     "relievedQuantity" DECIMAL(18,2) NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "DeliveryOrderItem_saleItemId_idx" ON "DeliveryOrderItem"("saleItemId");

-- AddForeignKey
ALTER TABLE "DeliveryOrderItem" ADD CONSTRAINT "DeliveryOrderItem_saleItemId_fkey" FOREIGN KEY ("saleItemId") REFERENCES "SaleItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
