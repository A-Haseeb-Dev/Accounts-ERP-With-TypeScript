import { Module } from '@nestjs/common';
import { SalesService } from './sales.service';
import { SalesReturnsService } from './sales-returns.service';
import { SalesController, SalesReturnsController } from './sales.controller';

@Module({
  controllers: [SalesController, SalesReturnsController],
  providers: [SalesService, SalesReturnsService],
  exports: [SalesService, SalesReturnsService],
})
export class SalesModule {}