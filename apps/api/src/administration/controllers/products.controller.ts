import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SimpleMasterService } from '../services/simple-master.service';
import { ItemsService } from '../services/items.service';
import {
  CreateBrandDto,
  CreateItemDto,
  CreateItemTypeDto,
  CreateStockLocationDto,
  UpdateBrandDto,
  UpdateItemDto,
  UpdateItemTypeDto,
  UpdateStockLocationDto,
} from '../dto/products.dto';
import { Permissions } from '../../auth/decorators/permissions.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

type SimpleModel = 'itemType' | 'brand' | 'stockLocation';

@ApiTags('Item Types')
@ApiBearerAuth()
@Controller('item-types')
export class ItemTypesController {
  constructor(private readonly service: SimpleMasterService) {}
  private model: SimpleModel = 'itemType';

  @Post() @Permissions('administration.item-types.create') @ApiOperation({ summary: 'Create an item type' })
  create(@Body() dto: CreateItemTypeDto, @CurrentUser() actor: any) { return this.service.create(this.model, dto, actor?.id); }
  @Get() @Permissions('administration.item-types.view') @ApiOperation({ summary: 'List item types' })
  findAll(@Query('page') page = '1', @Query('pageSize') pageSize = '25', @Query('search') search?: string, @Query('status') status?: string) {
    return this.service.findAll(this.model, { page: Number(page), pageSize: Number(pageSize), search, status });
  }
  @Get('flat') @Permissions('administration.item-types.view') @ApiOperation({ summary: 'List item types (for selects)' })
  findAllFlat() { return this.service.findAllFlat(this.model, true); }
  @Get(':id') @Permissions('administration.item-types.view') @ApiOperation({ summary: 'Get an item type' })
  findOne(@Param('id') id: string) { return this.service.findOne(this.model, id); }
  @Patch(':id') @Permissions('administration.item-types.update') @ApiOperation({ summary: 'Update an item type' })
  update(@Param('id') id: string, @Body() dto: UpdateItemTypeDto, @CurrentUser() actor: any) { return this.service.update(this.model, id, dto, actor?.id); }
  @Delete(':id') @Permissions('administration.item-types.delete') @ApiOperation({ summary: 'Deactivate an item type' })
  remove(@Param('id') id: string, @CurrentUser() actor: any) { return this.service.remove(this.model, id, actor?.id); }
}

@ApiTags('Brands')
@ApiBearerAuth()
@Controller('brands')
export class BrandsController {
  constructor(private readonly service: SimpleMasterService) {}
  private model: SimpleModel = 'brand';

  @Post() @Permissions('administration.brands.create') @ApiOperation({ summary: 'Create a brand' })
  create(@Body() dto: CreateBrandDto, @CurrentUser() actor: any) { return this.service.create(this.model, dto, actor?.id); }
  @Get() @Permissions('administration.brands.view') @ApiOperation({ summary: 'List brands' })
  findAll(@Query('page') page = '1', @Query('pageSize') pageSize = '25', @Query('search') search?: string, @Query('status') status?: string) {
    return this.service.findAll(this.model, { page: Number(page), pageSize: Number(pageSize), search, status });
  }
  @Get('flat') @Permissions('administration.brands.view') @ApiOperation({ summary: 'List brands (for selects)' })
  findAllFlat() { return this.service.findAllFlat(this.model, true); }
  @Get(':id') @Permissions('administration.brands.view') @ApiOperation({ summary: 'Get a brand' })
  findOne(@Param('id') id: string) { return this.service.findOne(this.model, id); }
  @Patch(':id') @Permissions('administration.brands.update') @ApiOperation({ summary: 'Update a brand' })
  update(@Param('id') id: string, @Body() dto: UpdateBrandDto, @CurrentUser() actor: any) { return this.service.update(this.model, id, dto, actor?.id); }
  @Delete(':id') @Permissions('administration.brands.delete') @ApiOperation({ summary: 'Deactivate a brand' })
  remove(@Param('id') id: string, @CurrentUser() actor: any) { return this.service.remove(this.model, id, actor?.id); }
}

@ApiTags('Stock Locations')
@ApiBearerAuth()
@Controller('stock-locations')
export class StockLocationsController {
  constructor(private readonly service: SimpleMasterService) {}
  private model: SimpleModel = 'stockLocation';

  @Post() @Permissions('administration.stock-locations.create') @ApiOperation({ summary: 'Create a stock location' })
  create(@Body() dto: CreateStockLocationDto, @CurrentUser() actor: any) { return this.service.create(this.model, dto, actor?.id); }
  @Get() @Permissions('administration.stock-locations.view') @ApiOperation({ summary: 'List stock locations' })
  findAll(@Query('page') page = '1', @Query('pageSize') pageSize = '25', @Query('search') search?: string, @Query('status') status?: string) {
    return this.service.findAll(this.model, { page: Number(page), pageSize: Number(pageSize), search, status });
  }
  @Get('flat') @Permissions('administration.stock-locations.view') @ApiOperation({ summary: 'List stock locations (for selects)' })
  findAllFlat() { return this.service.findAllFlat(this.model, true); }
  @Get(':id') @Permissions('administration.stock-locations.view') @ApiOperation({ summary: 'Get a stock location' })
  findOne(@Param('id') id: string) { return this.service.findOne(this.model, id); }
  @Patch(':id') @Permissions('administration.stock-locations.update') @ApiOperation({ summary: 'Update a stock location' })
  update(@Param('id') id: string, @Body() dto: UpdateStockLocationDto, @CurrentUser() actor: any) { return this.service.update(this.model, id, dto, actor?.id); }
  @Delete(':id') @Permissions('administration.stock-locations.delete') @ApiOperation({ summary: 'Deactivate a stock location' })
  remove(@Param('id') id: string, @CurrentUser() actor: any) { return this.service.remove(this.model, id, actor?.id); }
}

@ApiTags('Items')
@ApiBearerAuth()
@Controller('items')
export class ItemsController {
  constructor(private readonly service: ItemsService) {}

  @Post() @Permissions('administration.items.create') @ApiOperation({ summary: 'Create an item' })
  create(@Body() dto: CreateItemDto, @CurrentUser() actor: any) { return this.service.create(dto, actor?.id); }

  @Get() @Permissions('administration.items.view') @ApiOperation({ summary: 'List items with stock' })
  findAll(
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '25',
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('itemTypeId') itemTypeId?: string,
    @Query('brandId') brandId?: string,
  ) {
    return this.service.findAll({ page: Number(page), pageSize: Number(pageSize), search, status, itemTypeId, brandId });
  }

  @Get('search') @Permissions('administration.items.view') @ApiOperation({ summary: 'Search items (barcode-friendly)' })
  search(@Query('q') q = '', @Query('limit') limit = '10') {
    return this.service.searchItems({ search: q, limit: Number(limit) });
  }

  @Get(':id') @Permissions('administration.items.view') @ApiOperation({ summary: 'Get an item with stock' })
  findOne(@Param('id') id: string) { return this.service.findOne(id); }

  @Get(':id/stock') @Permissions('administration.items.stock') @ApiOperation({ summary: 'Get stock by location' })
  findStock(@Param('id') id: string) { return this.service.findStockByLocation(id); }

  @Get(':id/ledger') @Permissions('administration.items.stock') @ApiOperation({ summary: 'Get product ledger' })
  findLedger(@Param('id') id: string, @Query('page') page = '1', @Query('pageSize') pageSize = '25', @Query('from') from?: string, @Query('to') to?: string) {
    return this.service.findLedger(id, { page: Number(page), pageSize: Number(pageSize), from, to });
  }

  @Patch(':id') @Permissions('administration.items.update') @ApiOperation({ summary: 'Update an item' })
  update(@Param('id') id: string, @Body() dto: UpdateItemDto, @CurrentUser() actor: any) { return this.service.update(id, dto, actor?.id); }

  @Delete(':id') @Permissions('administration.items.delete') @ApiOperation({ summary: 'Deactivate an item' })
  remove(@Param('id') id: string, @CurrentUser() actor: any) { return this.service.remove(id, actor?.id); }
}