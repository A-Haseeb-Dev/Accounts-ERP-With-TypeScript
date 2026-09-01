import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { TownsService } from './services/towns.service';
import { CustomersService } from './services/customers.service';
import { SuppliersService } from './services/suppliers.service';
import {
  CreateCustomerDto,
  CreateSupplierDto,
  CreateTownDto,
  UpdateCustomerDto,
  UpdateSupplierDto,
  UpdateTownDto,
} from './dto/parties.dto';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Towns')
@ApiBearerAuth()
@Controller('towns')
export class TownsController {
  constructor(private readonly service: TownsService) {}

  @Post() @Permissions('administration.towns.create') @ApiOperation({ summary: 'Create a town' })
  create(@Body() dto: CreateTownDto, @CurrentUser() actor: any) { return this.service.create(dto, actor?.id); }
  @Get() @Permissions('administration.towns.view') @ApiOperation({ summary: 'List towns' })
  findAll(@Query('page') page = '1', @Query('pageSize') pageSize = '25', @Query('search') search?: string, @Query('status') status?: string) {
    return this.service.findAll({ page: Number(page), pageSize: Number(pageSize), search, status });
  }
  @Get('flat') @Permissions('administration.towns.view') @ApiOperation({ summary: 'List towns (for selects)' })
  findAllFlat() { return this.service.findAllFlat(); }
  @Get(':id') @Permissions('administration.towns.view') @ApiOperation({ summary: 'Get a town' })
  findOne(@Param('id') id: string) { return this.service.findOne(id); }
  @Patch(':id') @Permissions('administration.towns.update') @ApiOperation({ summary: 'Update a town' })
  update(@Param('id') id: string, @Body() dto: UpdateTownDto, @CurrentUser() actor: any) { return this.service.update(id, dto, actor?.id); }
  @Delete(':id') @Permissions('administration.towns.delete') @ApiOperation({ summary: 'Deactivate a town' })
  remove(@Param('id') id: string, @CurrentUser() actor: any) { return this.service.remove(id, actor?.id); }
}

@ApiTags('Customers')
@ApiBearerAuth()
@Controller('customers')
export class CustomersController {
  constructor(private readonly service: CustomersService) {}

  @Post() @Permissions('administration.customers.create') @ApiOperation({ summary: 'Create a customer' })
  create(@Body() dto: CreateCustomerDto, @CurrentUser() actor: any) { return this.service.create(dto, actor?.id); }
  @Get() @Permissions('administration.customers.view') @ApiOperation({ summary: 'List customers' })
  findAll(@Query('page') page = '1', @Query('pageSize') pageSize = '25', @Query('search') search?: string, @Query('status') status?: string, @Query('townId') townId?: string) {
    return this.service.findAll({ page: Number(page), pageSize: Number(pageSize), search, status, townId });
  }
  @Get('flat') @Permissions('administration.customers.view') @ApiOperation({ summary: 'List customers (for selects)' })
  findAllFlat() { return this.service.findAllFlat(); }
  @Get(':id') @Permissions('administration.customers.view') @ApiOperation({ summary: 'Get a customer with profile' })
  findOne(@Param('id') id: string) { return this.service.findOne(id); }
  @Get(':id/sales') @Permissions('administration.customers.view') @ApiOperation({ summary: 'Customer sales history' })
  findSales(@Param('id') id: string, @Query('page') page = '1', @Query('pageSize') pageSize = '25') {
    return this.service.findSalesHistory(id, { page: Number(page), pageSize: Number(pageSize) });
  }
  @Get(':id/returns') @Permissions('administration.customers.view') @ApiOperation({ summary: 'Customer returns history' })
  findReturns(@Param('id') id: string, @Query('page') page = '1', @Query('pageSize') pageSize = '25') {
    return this.service.findReturnsHistory(id, { page: Number(page), pageSize: Number(pageSize) });
  }
  @Get(':id/ledger') @Permissions('administration.customers.view') @ApiOperation({ summary: 'Customer ledger' })
  findLedger(@Param('id') id: string, @Query('page') page = '1', @Query('pageSize') pageSize = '25', @Query('from') from?: string, @Query('to') to?: string) {
    return this.service.findLedger(id, { page: Number(page), pageSize: Number(pageSize), from, to });
  }
  @Patch(':id') @Permissions('administration.customers.update') @ApiOperation({ summary: 'Update a customer' })
  update(@Param('id') id: string, @Body() dto: UpdateCustomerDto, @CurrentUser() actor: any) { return this.service.update(id, dto, actor?.id); }
  @Delete(':id') @Permissions('administration.customers.delete') @ApiOperation({ summary: 'Deactivate a customer' })
  remove(@Param('id') id: string, @CurrentUser() actor: any) { return this.service.remove(id, actor?.id); }
}

@ApiTags('Suppliers')
@ApiBearerAuth()
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly service: SuppliersService) {}

  @Post() @Permissions('administration.suppliers.create') @ApiOperation({ summary: 'Create a supplier' })
  create(@Body() dto: CreateSupplierDto, @CurrentUser() actor: any) { return this.service.create(dto, actor?.id); }
  @Get() @Permissions('administration.suppliers.view') @ApiOperation({ summary: 'List suppliers' })
  findAll(@Query('page') page = '1', @Query('pageSize') pageSize = '25', @Query('search') search?: string, @Query('status') status?: string, @Query('townId') townId?: string) {
    return this.service.findAll({ page: Number(page), pageSize: Number(pageSize), search, status, townId });
  }
  @Get('flat') @Permissions('administration.suppliers.view') @ApiOperation({ summary: 'List suppliers (for selects)' })
  findAllFlat() { return this.service.findAllFlat(); }
  @Get(':id') @Permissions('administration.suppliers.view') @ApiOperation({ summary: 'Get a supplier with profile' })
  findOne(@Param('id') id: string) { return this.service.findOne(id); }
  @Get(':id/purchases') @Permissions('administration.suppliers.view') @ApiOperation({ summary: 'Supplier purchase history' })
  findPurchases(@Param('id') id: string, @Query('page') page = '1', @Query('pageSize') pageSize = '25') {
    return this.service.findPurchaseHistory(id, { page: Number(page), pageSize: Number(pageSize) });
  }
  @Get(':id/returns') @Permissions('administration.suppliers.view') @ApiOperation({ summary: 'Supplier returns history' })
  findReturns(@Param('id') id: string, @Query('page') page = '1', @Query('pageSize') pageSize = '25') {
    return this.service.findReturnHistory(id, { page: Number(page), pageSize: Number(pageSize) });
  }
  @Get(':id/ledger') @Permissions('administration.suppliers.view') @ApiOperation({ summary: 'Supplier ledger' })
  findLedger(@Param('id') id: string, @Query('page') page = '1', @Query('pageSize') pageSize = '25', @Query('from') from?: string, @Query('to') to?: string) {
    return this.service.findLedger(id, { page: Number(page), pageSize: Number(pageSize), from, to });
  }
  @Patch(':id') @Permissions('administration.suppliers.update') @ApiOperation({ summary: 'Update a supplier' })
  update(@Param('id') id: string, @Body() dto: UpdateSupplierDto, @CurrentUser() actor: any) { return this.service.update(id, dto, actor?.id); }
  @Delete(':id') @Permissions('administration.suppliers.delete') @ApiOperation({ summary: 'Deactivate a supplier' })
  remove(@Param('id') id: string, @CurrentUser() actor: any) { return this.service.remove(id, actor?.id); }
}