import { Module } from '@nestjs/common';
import { SalesService } from './sales.service';
import { SalesReturnsService } from './sales-returns.service';
import { QuotationsService } from './quotations.service';
import { QuotationsController } from './quotations.controller';
import { SalesController, SalesReturnsController } from './sales.controller';

@Module({
  controllers: [SalesController, SalesReturnsController, QuotationsController],
  providers: [SalesService, SalesReturnsService, QuotationsService],
  exports: [SalesService, SalesReturnsService, QuotationsService],
})
export class SalesModule {}