import { Module } from '@nestjs/common';
import {
  HeadAccountsController,
  SubHeadsController,
  MainAccountsController,
} from './controllers/accounts.controller';
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
import { ItemsService } from './services/items.service';

@Module({
  controllers: [
    HeadAccountsController,
    SubHeadsController,
    MainAccountsController,
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
    ItemsService,
  ],
  exports: [ItemsService],
})
export class AdministrationModule {}