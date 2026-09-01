import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { AccountingReportsService } from './accounting-reports.service';
import { InventoryReportsService } from './inventory-reports.service';

@Module({
  controllers: [ReportsController],
  providers: [AccountingReportsService, InventoryReportsService],
})
export class ReportsModule {}