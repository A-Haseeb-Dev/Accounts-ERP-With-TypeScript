import { Module } from '@nestjs/common';
import {
  PurchasesController,
  PurchaseReturnsController,
  StockTransfersController,
} from './inventory.controller';
import { PurchasesService } from './purchases.service';
import { PurchaseReturnsService } from './purchase-returns.service';
import { StockTransfersService } from './stock-transfers.service';

@Module({
  controllers: [PurchasesController, PurchaseReturnsController, StockTransfersController],
  providers: [PurchasesService, PurchaseReturnsService, StockTransfersService],
  exports: [PurchasesService, PurchaseReturnsService, StockTransfersService],
})
export class InventoryModule {}