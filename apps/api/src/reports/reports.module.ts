import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { AccountingReportsService } from './accounting-reports.service';
import { InventoryReportsService } from './inventory-reports.service';
import { DayReportsService } from './day-reports.service';
import { PartyReportsService } from './party-reports.service';

@Module({
  controllers: [ReportsController],
  providers: [AccountingReportsService, InventoryReportsService, DayReportsService, PartyReportsService],
})
export class ReportsModule {}