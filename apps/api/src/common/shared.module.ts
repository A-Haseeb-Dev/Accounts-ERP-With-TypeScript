import { Global, Module } from '@nestjs/common';
import { NumberingService } from './services/numbering.service';
import { InventoryService } from './services/inventory.service';
import { AccountingService } from './services/accounting.service';
import { DefaultAccountsService } from './services/default-accounts.service';
import { FiscalPeriodGuard } from './services/fiscal-period.guard';
import { HealthController } from './health.controller';

@Global()
@Module({
  controllers: [HealthController],
  providers: [NumberingService, InventoryService, AccountingService, DefaultAccountsService, FiscalPeriodGuard],
  exports: [NumberingService, InventoryService, AccountingService, DefaultAccountsService, FiscalPeriodGuard],
})
export class SharedModule {}