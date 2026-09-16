import { Module } from '@nestjs/common';
import {
  HeadAccountsController,
  SubHeadsController,
  MainAccountsController,
} from './controllers/accounts.controller';
import { BanksController } from './controllers/banks.controller';
import {
  ItemsController,
  ItemTypesController,
  BrandsController,
  StockLocationsController,
} from './controllers/products.controller';
import { HeadAccountsService } from './services/head-accounts.service';
import { SubHeadsService } from './services/sub-heads.service';
import { MainAccountsService } from './services/main-accounts.service';
import { SimpleMasterService } from './services/simple-master.service';
import { BanksService } from './services/banks.service';
import { ItemsService } from './services/items.service';

@Module({
  controllers: [
    HeadAccountsController,
    SubHeadsController,
    MainAccountsController,
    BanksController,
    ItemsController,
    ItemTypesController,
    BrandsController,
    StockLocationsController,
  ],
  providers: [
    HeadAccountsService,
    SubHeadsService,
    MainAccountsService,
    SimpleMasterService,
    BanksService,
    ItemsService,
  ],
  exports: [ItemsService],
})
export class AdministrationModule {}