import { Global, Module } from '@nestjs/common';
import { NumberingService } from './services/numbering.service';
import { InventoryService } from './services/inventory.service';
import { AccountingService } from './services/accounting.service';
import { DefaultAccountsService } from './services/default-accounts.service';

@Global()
@Module({
  providers: [NumberingService, InventoryService, AccountingService, DefaultAccountsService],
  exports: [NumberingService, InventoryService, AccountingService, DefaultAccountsService],
})
export class SharedModule {}