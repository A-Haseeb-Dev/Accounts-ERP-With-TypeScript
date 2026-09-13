import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PurchasesService } from './purchases.service';
import { PurchaseReturnsService } from './purchase-returns.service';
import { StockTransfersService } from './stock-transfers.service';
import { CreatePurchaseDto, CreatePurchaseReturnDto, CreateStockTransferDto } from './dto/inventory.dto';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Purchases')
@ApiBearerAuth()
@Controller('purchases')
export class PurchasesController {
  constructor(private readonly service: PurchasesService) {}

  @Post() @Permissions('inventory.purchase.create') @ApiOperation({ summary: 'Create a purchase (draft)' })
  create(@Body() dto: CreatePurchaseDto, @CurrentUser() actor: any) { return this.service.create(dto, actor?.id); }

  @Get() @Permissions('inventory.purchase.view') @ApiOperation({ summary: 'List purchases' })
  findAll(
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '25',
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('supplierId') supplierId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) { return this.service.findAll({ page: Number(page), pageSize: Number(pageSize), search, status, supplierId, from, to }); }

  @Get('next-number') @Permissions('inventory.purchase.view') @ApiOperation({ summary: 'Preview the next auto-generated purchase number' })
  async nextNumber() { return { number: await this.service.previewNumber() }; }

  @Get(':id') @Permissions('inventory.purchase.view') @ApiOperation({ summary: 'Get a purchase' })
  findOne(@Param('id') id: string) { return this.service.findOne(id); }

  @Post(':id/post') @Permissions('inventory.purchase.post') @ApiOperation({ summary: 'Post / approve a purchase (inventory + accounting)' })
  post(@Param('id') id: string, @CurrentUser() actor: any) { return this.service.post(id, actor?.id); }

  @Post(':id/submit') @Permissions('inventory.purchase.submit') @ApiOperation({ summary: 'Submit a draft purchase for approval' })
  submit(@Param('id') id: string, @CurrentUser() actor: any) { return this.service.submit(id, actor?.id); }

  @Post(':id/reject') @Permissions('inventory.purchase.reject') @ApiOperation({ summary: 'Reject a submitted purchase back to draft' })
  reject(@Param('id') id: string, @Body() body: { reason: string }, @CurrentUser() actor: any) { return this.service.reject(id, body.reason ?? 'Rejected', actor?.id); }

  @Patch(':id') @Permissions('inventory.purchase.update') @ApiOperation({ summary: 'Update a draft purchase' })
  update(@Param('id') id: string, @Body() dto: CreatePurchaseDto, @CurrentUser() actor: any) { return this.service.update(id, dto, actor?.id); }

  @Delete(':id') @Permissions('inventory.purchase.delete') @ApiOperation({ summary: 'Delete a draft purchase' })
  remove(@Param('id') id: string, @CurrentUser() actor: any) { return this.service.remove(id, actor?.id); }

  @Delete(':id/cancel') @Permissions('inventory.purchase.cancel') @ApiOperation({ summary: 'Cancel a draft purchase' })
  cancel(@Param('id') id: string, @Body() body: { reason: string }, @CurrentUser() actor: any) { return this.service.cancel(id, body.reason ?? 'Cancelled', actor?.id); }
}

@ApiTags('Purchase Returns')
@ApiBearerAuth()
@Controller('purchase-returns')
export class PurchaseReturnsController {
  constructor(private readonly service: PurchaseReturnsService) {}

  @Post() @Permissions('inventory.purchase-return.create') @ApiOperation({ summary: 'Create a purchase return (draft)' })
  create(@Body() dto: CreatePurchaseReturnDto, @CurrentUser() actor: any) { return this.service.create(dto, actor?.id); }

  @Get() @Permissions('inventory.purchase-return.view') @ApiOperation({ summary: 'List purchase returns' })
  findAll(
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '25',
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('supplierId') supplierId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) { return this.service.findAll({ page: Number(page), pageSize: Number(pageSize), search, status, supplierId, from, to }); }

  @Get('next-number') @Permissions('inventory.purchase-return.view') @ApiOperation({ summary: 'Preview the next auto-generated purchase return number' })
  async nextNumber() { return { number: await this.service.previewNumber() }; }

  @Get(':id') @Permissions('inventory.purchase-return.view') @ApiOperation({ summary: 'Get a purchase return' })
  findOne(@Param('id') id: string) { return this.service.findOne(id); }

  @Post(':id/post') @Permissions('inventory.purchase-return.post') @ApiOperation({ summary: 'Post / approve a purchase return (inventory + accounting)' })
  post(@Param('id') id: string, @CurrentUser() actor: any) { return this.service.post(id, actor?.id); }

  @Post(':id/submit') @Permissions('inventory.purchase-return.submit') @ApiOperation({ summary: 'Submit a draft purchase return for approval' })
  submit(@Param('id') id: string, @CurrentUser() actor: any) { return this.service.submit(id, actor?.id); }

  @Post(':id/reject') @Permissions('inventory.purchase-return.reject') @ApiOperation({ summary: 'Reject a submitted purchase return back to draft' })
  reject(@Param('id') id: string, @Body() body: { reason: string }, @CurrentUser() actor: any) { return this.service.reject(id, body.reason ?? 'Rejected', actor?.id); }

  @Patch(':id') @Permissions('inventory.purchase-return.update') @ApiOperation({ summary: 'Update a draft purchase return' })
  update(@Param('id') id: string, @Body() dto: CreatePurchaseReturnDto, @CurrentUser() actor: any) { return this.service.update(id, dto, actor?.id); }

  @Delete(':id') @Permissions('inventory.purchase-return.delete') @ApiOperation({ summary: 'Delete a draft purchase return' })
  remove(@Param('id') id: string, @CurrentUser() actor: any) { return this.service.remove(id, actor?.id); }

  @Delete(':id/cancel') @Permissions('inventory.purchase-return.cancel') @ApiOperation({ summary: 'Cancel a draft purchase return' })
  cancel(@Param('id') id: string, @Body() body: { reason: string }, @CurrentUser() actor: any) { return this.service.cancel(id, body.reason ?? 'Cancelled', actor?.id); }
}

@ApiTags('Stock Transfers')
@ApiBearerAuth()
@Controller('stock-transfers')
export class StockTransfersController {
  constructor(private readonly service: StockTransfersService) {}

  @Post() @Permissions('inventory.transfer.create') @ApiOperation({ summary: 'Create a stock transfer (draft)' })
  create(@Body() dto: CreateStockTransferDto, @CurrentUser() actor: any) { return this.service.create(dto, actor?.id); }

  @Get() @Permissions('inventory.transfer.view') @ApiOperation({ summary: 'List stock transfers' })
  findAll(
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '25',
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) { return this.service.findAll({ page: Number(page), pageSize: Number(pageSize), search, status, from, to }); }

  @Get('next-number') @Permissions('inventory.transfer.view') @ApiOperation({ summary: 'Preview the next auto-generated stock transfer number' })
  async nextNumber() { return { number: await this.service.previewNumber() }; }

  @Get(':id') @Permissions('inventory.transfer.view') @ApiOperation({ summary: 'Get a stock transfer' })
  findOne(@Param('id') id: string) { return this.service.findOne(id); }

  @Post(':id/post') @Permissions('inventory.transfer.post') @ApiOperation({ summary: 'Post / approve a stock transfer' })
  post(@Param('id') id: string, @CurrentUser() actor: any) { return this.service.post(id, actor?.id); }

  @Post(':id/submit') @Permissions('inventory.transfer.submit') @ApiOperation({ summary: 'Submit a draft transfer for approval' })
  submit(@Param('id') id: string, @CurrentUser() actor: any) { return this.service.submit(id, actor?.id); }

  @Post(':id/reject') @Permissions('inventory.transfer.reject') @ApiOperation({ summary: 'Reject a submitted transfer back to draft' })
  reject(@Param('id') id: string, @Body() body: { reason: string }, @CurrentUser() actor: any) { return this.service.reject(id, body.reason ?? 'Rejected', actor?.id); }

  @Patch(':id') @Permissions('inventory.transfer.update') @ApiOperation({ summary: 'Update a draft transfer' })
  update(@Param('id') id: string, @Body() dto: CreateStockTransferDto, @CurrentUser() actor: any) { return this.service.update(id, dto, actor?.id); }

  @Delete(':id') @Permissions('inventory.transfer.delete') @ApiOperation({ summary: 'Delete a draft transfer' })
  remove(@Param('id') id: string, @CurrentUser() actor: any) { return this.service.remove(id, actor?.id); }

  @Delete(':id/cancel') @Permissions('inventory.transfer.cancel') @ApiOperation({ summary: 'Cancel a draft transfer' })
  cancel(@Param('id') id: string, @Body() body: { reason: string }, @CurrentUser() actor: any) { return this.service.cancel(id, body.reason ?? 'Cancelled', actor?.id); }
}