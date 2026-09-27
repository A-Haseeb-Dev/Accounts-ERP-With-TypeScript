import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { QuotationsService } from './quotations.service';
import { CreateQuotationDto } from './dto/sales.dto';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Quotations')
@ApiBearerAuth()
@Controller('quotations')
export class QuotationsController {
  constructor(private readonly service: QuotationsService) {}

  @Post() @Permissions('sales.quotation.create') @ApiOperation({ summary: 'Create a quotation (draft)' })
  create(@Body() dto: CreateQuotationDto, @CurrentUser() actor: any) { return this.service.create(dto, actor?.id); }

  @Get() @Permissions('sales.quotation.view') @ApiOperation({ summary: 'List quotations' })
  findAll(
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '25',
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('customerId') customerId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) { return this.service.findAll({ page: Number(page), pageSize: Number(pageSize), search, status, customerId, from, to }); }

  @Get('next-number') @Permissions('sales.quotation.view') @ApiOperation({ summary: 'Preview the next auto-generated quotation number' })
  async nextNumber() { return { number: await this.service.previewNumber() }; }

  @Get(':id') @Permissions('sales.quotation.view') @ApiOperation({ summary: 'Get a quotation' })
  findOne(@Param('id') id: string) { return this.service.findOne(id); }

  @Post(':id/send') @Permissions('sales.quotation.send') @ApiOperation({ summary: 'Mark a draft quotation as sent' })
  send(@Param('id') id: string, @CurrentUser() actor: any) { return this.service.send(id, actor?.id); }

  @Post(':id/accept') @Permissions('sales.quotation.accept') @ApiOperation({ summary: 'Mark a sent quotation as accepted' })
  accept(@Param('id') id: string, @CurrentUser() actor: any) { return this.service.accept(id, actor?.id); }

  @Post(':id/reject') @Permissions('sales.quotation.reject') @ApiOperation({ summary: 'Mark a sent quotation as rejected' })
  reject(@Param('id') id: string, @Body() body: { reason: string }, @CurrentUser() actor: any) { return this.service.reject(id, body.reason ?? 'Rejected', actor?.id); }

  @Post(':id/convert') @Permissions('sales.quotation.convert') @ApiOperation({ summary: 'Convert an accepted quotation into a draft sales invoice' })
  convert(@Param('id') id: string, @Body() body: { stockLocationId?: string; saleDate?: string }, @CurrentUser() actor: any) { return this.service.convertToSale(id, body ?? {}, actor?.id); }

  @Patch(':id') @Permissions('sales.quotation.update') @ApiOperation({ summary: 'Update a quotation' })
  update(@Param('id') id: string, @Body() dto: CreateQuotationDto, @CurrentUser() actor: any) { return this.service.update(id, dto, actor?.id); }

  @Delete(':id') @Permissions('sales.quotation.delete') @ApiOperation({ summary: 'Delete a quotation' })
  remove(@Param('id') id: string, @CurrentUser() actor: any) { return this.service.remove(id, actor?.id); }
}
