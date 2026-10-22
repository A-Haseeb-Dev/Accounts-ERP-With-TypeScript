import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { InvestorsService } from './investors.service';
import { InvestmentsService } from './investments.service';
import {
  CloseInvestmentDto,
  CreateInvestmentDto,
  CreateInvestorDto,
  PayInstallmentDto,
  ReceiveInvestmentDto,
  UpdateInvestmentDto,
  UpdateInstallmentDto,
  UpdateInvestorDto,
} from './dto/investments.dto';

@ApiTags('Investors')
@ApiBearerAuth()
@Controller('investments/investors')
export class InvestorsController {
  constructor(private readonly service: InvestorsService) {}

  @Get() @Permissions('investments.view') @ApiOperation({ summary: 'List investors' })
  findAll(
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '25',
    @Query('search') search?: string,
    @Query('status') status?: string,
  ) {
    return this.service.findAll({
      page: Number(page),
      pageSize: Number(pageSize),
      search,
      status,
    });
  }

  @Post() @Permissions('investments.investor.create') @ApiOperation({ summary: 'Add an investor' })
  create(@Body() dto: CreateInvestorDto, @CurrentUser() actor: any) {
    return this.service.create(dto, actor?.id);
  }

  @Get(':id/statement') @Permissions('investments.view') @ApiOperation({ summary: 'Investor statement (capital in, returns, outstanding)' })
  statement(
    @Param('id') id: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.statement(id, { from, to });
  }

  @Get(':id') @Permissions('investments.view') @ApiOperation({ summary: 'Get an investor' })
  findOne(@Param('id') id: string) { return this.service.findOne(id); }

  @Patch(':id') @Permissions('investments.investor.update') @ApiOperation({ summary: 'Edit an investor' })
  update(@Param('id') id: string, @Body() dto: UpdateInvestorDto, @CurrentUser() actor: any) {
    return this.service.update(id, dto, actor?.id);
  }

  @Delete(':id') @Permissions('investments.investor.delete') @ApiOperation({ summary: 'Remove an investor' })
  remove(@Param('id') id: string, @CurrentUser() actor: any) { return this.service.remove(id, actor?.id); }
}

@ApiTags('Investments')
@ApiBearerAuth()
@Controller('investments')
export class InvestmentsController {
  constructor(private readonly service: InvestmentsService) {}

  @Get() @Permissions('investments.view') @ApiOperation({ summary: 'List investments' })
  findAll(
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '25',
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('investorId') investorId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.findAll({
      page: Number(page),
      pageSize: Number(pageSize),
      search,
      status,
      investorId,
      from,
      to,
    });
  }

  @Get('next-number') @Permissions('investments.view') @ApiOperation({ summary: 'Preview the next investment number' })
  async nextNumber() { return { number: await this.service.previewNumber() }; }

  @Post() @Permissions('investments.create') @ApiOperation({ summary: 'Record a new investment' })
  create(@Body() dto: CreateInvestmentDto, @CurrentUser() actor: any) {
    return this.service.create(dto, actor?.id);
  }

  @Get(':id') @Permissions('investments.view') @ApiOperation({ summary: 'Get an investment' })
  findOne(@Param('id') id: string) { return this.service.findOne(id); }

  @Patch(':id') @Permissions('investments.update') @ApiOperation({ summary: 'Edit an investment' })
  update(@Param('id') id: string, @Body() dto: UpdateInvestmentDto, @CurrentUser() actor: any) {
    return this.service.update(id, dto, actor?.id);
  }

  @Post(':id/receive') @Permissions('investments.receive') @ApiOperation({ summary: 'Record the money received' })
  receive(@Param('id') id: string, @Body() dto: ReceiveInvestmentDto, @CurrentUser() actor: any) {
    return this.service.receive(id, dto, actor?.id);
  }

  @Post(':id/installments/:installmentId/pay') @Permissions('investments.payout') @ApiOperation({ summary: 'Pay an installment' })
  payInstallment(
    @Param('id') id: string,
    @Param('installmentId') installmentId: string,
    @Body() dto: PayInstallmentDto,
    @CurrentUser() actor: any,
  ) {
    return this.service.payInstallment(id, installmentId, dto, actor?.id);
  }

  @Patch(':id/installments/:installmentId') @Permissions('investments.payout') @ApiOperation({ summary: 'Reschedule an installment' })
  rescheduleInstallment(
    @Param('id') id: string,
    @Param('installmentId') installmentId: string,
    @Body() dto: UpdateInstallmentDto,
    @CurrentUser() actor: any,
  ) {
    return this.service.rescheduleInstallment(id, installmentId, dto, actor?.id);
  }

  @Post(':id/installments/:installmentId/skip') @Permissions('investments.payout') @ApiOperation({ summary: 'Skip an installment' })
  skipInstallment(
    @Param('id') id: string,
    @Param('installmentId') installmentId: string,
    @Body() dto: { note?: string },
    @CurrentUser() actor: any,
  ) {
    return this.service.skipInstallment(id, installmentId, dto ?? {}, actor?.id);
  }

  @Post(':id/close') @Permissions('investments.close') @ApiOperation({ summary: 'Close an investment and return the principal' })
  close(@Param('id') id: string, @Body() dto: CloseInvestmentDto, @CurrentUser() actor: any) {
    return this.service.close(id, dto, actor?.id);
  }

  @Post(':id/cancel') @Permissions('investments.update') @ApiOperation({ summary: 'Cancel an investment' })
  cancel(@Param('id') id: string, @Body() body: { reason: string }, @CurrentUser() actor: any) {
    return this.service.cancel(id, body.reason ?? 'Cancelled', actor?.id);
  }

  @Delete(':id') @Permissions('investments.delete') @ApiOperation({ summary: 'Delete an investment' })
  remove(@Param('id') id: string, @CurrentUser() actor: any) { return this.service.remove(id, actor?.id); }
}

