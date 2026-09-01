import { Module } from '@nestjs/common';
import { TownsService } from './services/towns.service';
import { CustomersService } from './services/customers.service';
import { SuppliersService } from './services/suppliers.service';
import { TownsController, CustomersController, SuppliersController } from './parties.controller';

@Module({
  controllers: [TownsController, CustomersController, SuppliersController],
  providers: [TownsService, CustomersService, SuppliersService],
  exports: [CustomersService, SuppliersService],
})
export class PartiesModule {}