import { Module } from '@nestjs/common';
import { SalesService } from './sales.service';
import { SalesReturnsService } from './sales-returns.service';
import { QuotationsService } from './quotations.service';
import { DeliveryOrdersService } from './delivery-orders.service';
import { QuotationsController } from './quotations.controller';
import { SalesController, SalesReturnsController, DeliveryOrdersController } from './sales.controller';

@Module({
  // The delivery order routes live under /sales/delivery-orders, and the
  // invoice routes end in /sales/:id. The delivery order controller is
  // registered first so that Express matches the specific path before the
  // invoice wildcard swallows it.
  controllers: [DeliveryOrdersController, SalesController, SalesReturnsController, QuotationsController],
  providers: [SalesService, SalesReturnsService, QuotationsService, DeliveryOrdersService],
  exports: [SalesService, SalesReturnsService, QuotationsService, DeliveryOrdersService],
})
export class SalesModule {}
