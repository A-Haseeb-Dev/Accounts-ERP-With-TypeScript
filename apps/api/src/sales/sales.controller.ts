import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SalesService } from './sales.service';
import { SalesReturnsService } from './sales-returns.service';
import { CreateSaleDto, CreateSalesReturnDto } from './dto/sales.dto';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Sales')
@ApiBearerAuth()
@Controller('sales')
export class SalesController {
  constructor(private readonly service: SalesService) {}

  @Post() @Permissions('sales.invoice.create') @ApiOperation({ summary: 'Create a sales invoice (draft)' })
  create(@Body() dto: CreateSaleDto, @CurrentUser() actor: any) { return this.service.create(dto, actor?.id); }

  @Get() @Permissions('sales.invoice.view') @ApiOperation({ summary: 'List sales invoices' })
  findAll(
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '25',
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('customerId') customerId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) { return this.service.findAll({ page: Number(page), pageSize: Number(pageSize), search, status, customerId, from, to }); }

  @Get('next-number') @Permissions('sales.invoice.view') @ApiOperation({ summary: 'Preview the next auto-generated invoice number' })
  async nextNumber() { return { number: await this.service.previewNumber() }; }

  @Get(':id') @Permissions('sales.invoice.view') @ApiOperation({ summary: 'Get a sales invoice' })
  findOne(@Param('id') id: string) { return this.service.findOne(id); }

  @Post(':id/post') @Permissions('sales.invoice.post') @ApiOperation({ summary: 'Post / approve a sales invoice (stock + accounting)' })
  post(@Param('id') id: string, @CurrentUser() actor: any) { return this.service.post(id, actor?.id); }

  @Post(':id/submit') @Permissions('sales.invoice.submit') @ApiOperation({ summary: 'Submit a draft invoice for approval' })
  submit(@Param('id') id: string, @CurrentUser() actor: any) { return this.service.submit(id, actor?.id); }

  @Post(':id/reject') @Permissions('sales.invoice.reject') @ApiOperation({ summary: 'Reject a submitted invoice back to draft' })
  reject(@Param('id') id: string, @Body() body: { reason: string }, @CurrentUser() actor: any) { return this.service.reject(id, body.reason ?? 'Rejected', actor?.id); }

  @Patch(':id') @Permissions('sales.invoice.update') @ApiOperation({ summary: 'Update a draft invoice' })
  update(@Param('id') id: string, @Body() dto: CreateSaleDto, @CurrentUser() actor: any) { return this.service.update(id, dto, actor?.id); }

  @Delete(':id') @Permissions('sales.invoice.delete') @ApiOperation({ summary: 'Delete a draft invoice' })
  remove(@Param('id') id: string, @CurrentUser() actor: any) { return this.service.remove(id, actor?.id); }

  @Delete(':id/cancel') @Permissions('sales.invoice.cancel') @ApiOperation({ summary: 'Cancel a draft invoice' })
  cancel(@Param('id') id: string, @Body() body: { reason: string }, @CurrentUser() actor: any) { return this.service.cancel(id, body.reason ?? 'Cancelled', actor?.id); }
}

@ApiTags('Sales Returns')
@ApiBearerAuth()
@Controller('sales-returns')
export class SalesReturnsController {
  constructor(private readonly service: SalesReturnsService) {}

  @Post() @Permissions('sales.return.create') @ApiOperation({ summary: 'Create a sales return (draft)' })
  create(@Body() dto: CreateSalesReturnDto, @CurrentUser() actor: any) { return this.service.create(dto, actor?.id); }

  @Get() @Permissions('sales.return.view') @ApiOperation({ summary: 'List sales returns' })
  findAll(
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '25',
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('customerId') customerId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) { return this.service.findAll({ page: Number(page), pageSize: Number(pageSize), search, status, customerId, from, to }); }

  @Get('next-number') @Permissions('sales.return.view') @ApiOperation({ summary: 'Preview the next auto-generated sales return number' })
  async nextNumber() { return { number: await this.service.previewNumber() }; }

  @Get(':id') @Permissions('sales.return.view') @ApiOperation({ summary: 'Get a sales return' })
  findOne(@Param('id') id: string) { return this.service.findOne(id); }

  @Post(':id/post') @Permissions('sales.return.post') @ApiOperation({ summary: 'Post / approve a sales return (stock + accounting)' })
  post(@Param('id') id: string, @CurrentUser() actor: any) { return this.service.post(id, actor?.id); }

  @Post(':id/submit') @Permissions('sales.return.submit') @ApiOperation({ summary: 'Submit a draft sales return for approval' })
  submit(@Param('id') id: string, @CurrentUser() actor: any) { return this.service.submit(id, actor?.id); }

  @Post(':id/reject') @Permissions('sales.return.reject') @ApiOperation({ summary: 'Reject a submitted sales return back to draft' })
  reject(@Param('id') id: string, @Body() body: { reason: string }, @CurrentUser() actor: any) { return this.service.reject(id, body.reason ?? 'Rejected', actor?.id); }

  @Patch(':id') @Permissions('sales.return.update') @ApiOperation({ summary: 'Update a draft sales return' })
  update(@Param('id') id: string, @Body() dto: CreateSalesReturnDto, @CurrentUser() actor: any) { return this.service.update(id, dto, actor?.id); }

  @Delete(':id') @Permissions('sales.return.delete') @ApiOperation({ summary: 'Delete a draft sales return' })
  remove(@Param('id') id: string, @CurrentUser() actor: any) { return this.service.remove(id, actor?.id); }

  @Delete(':id/cancel') @Permissions('sales.return.cancel') @ApiOperation({ summary: 'Cancel a draft sales return' })
  cancel(@Param('id') id: string, @Body() body: { reason: string }, @CurrentUser() actor: any) { return this.service.cancel(id, body.reason ?? 'Cancelled', actor?.id); }
}