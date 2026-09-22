import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto, CancelPaymentDto, EndorseChequeDto, EditChequeDto, DepositChequeDto } from './dto/payments.dto';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Receipts & Payments')
@ApiBearerAuth()
@Controller('payments')
export class PaymentsController {
  constructor(private readonly service: PaymentsService) {}

  @Post()
  @Permissions('accounts.payments.create')
  @ApiOperation({ summary: 'Create a receipt or payment entry (pending approval)' })
  create(@Body() dto: CreatePaymentDto, @CurrentUser() actor: any) {
    return this.service.create(dto, actor?.id);
  }

  @Get()
  @Permissions('accounts.payments.view')
  @ApiOperation({ summary: 'List receipts & payments' })
  findAll(
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '25',
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('paymentType') paymentType?: string,
    @Query('partyType') partyType?: string,
    @Query('partyId') partyId?: string,
    @Query('method') method?: string,
    @Query('chequeStatus') chequeStatus?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.findAll({
      page: Number(page), pageSize: Number(pageSize), search, status,
      paymentType, partyType, partyId, method, chequeStatus, from, to,
    });
  }

  @Get('open-invoices')
  @Permissions('accounts.payments.view')
  @ApiOperation({ summary: 'List open invoices for a customer/supplier (for allocation)' })
  openInvoices(@Query('partyType') partyType: string, @Query('partyId') partyId: string) {
    return this.service.openInvoices(partyType, partyId);
  }

  @Get('next-number')
  @Permissions('accounts.payments.view')
  @ApiOperation({ summary: 'Preview the next payment entry number' })
  async nextNumber(@Query('paymentType') paymentType?: string) {
    return { number: await this.service.previewNumber(paymentType) };
  }

  @Get(':id')
  @Permissions('accounts.payments.view')
  @ApiOperation({ summary: 'Get a payment entry' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post(':id/post')
  @Permissions('accounts.payments.post')
  @ApiOperation({ summary: 'Approve / post a payment entry (posts accounting voucher)' })
  post(@Param('id') id: string, @CurrentUser() actor: any) {
    return this.service.post(id, actor?.id);
  }

  @Delete(':id/cancel')
  @Permissions('accounts.payments.cancel')
  @ApiOperation({ summary: 'Cancel a pending payment entry' })
  cancel(@Param('id') id: string, @Body() dto: CancelPaymentDto, @CurrentUser() actor: any) {
    return this.service.cancel(id, dto.reason, actor?.id);
  }

  @Post(':id/deposit')
  @Permissions('accounts.payments.post')
  @ApiOperation({ summary: 'Clear a cheque in hand into the bank account' })
  deposit(@Param('id') id: string, @Body() dto: DepositChequeDto, @CurrentUser() actor: any) {
    return this.service.deposit(id, dto?.bankAccountId, actor?.id);
  }

  @Post(':id/bounce')
  @Permissions('accounts.payments.post')
  @ApiOperation({ summary: 'Mark a cheque as bounced and reverse to the party' })
  bounce(@Param('id') id: string, @Body() dto: CancelPaymentDto, @CurrentUser() actor: any) {
    return this.service.bounce(id, dto.reason, actor?.id);
  }

  @Post(':id/endorse')
  @Permissions('accounts.payments.post')
  @ApiOperation({ summary: 'Endorse a cheque in hand to another party (PDC payment voucher)' })
  endorse(@Param('id') id: string, @Body() dto: EndorseChequeDto, @CurrentUser() actor: any) {
    return this.service.endorse(id, dto, actor?.id);
  }

  @Patch(':id/cheque')
  @Permissions('accounts.payments.update')
  @ApiOperation({ summary: 'Correct a mistake on a cheque entry (number, date, bank, amount, reference)' })
  updateCheque(@Param('id') id: string, @Body() dto: EditChequeDto, @CurrentUser() actor: any) {
    return this.service.updateCheque(id, dto, actor?.id);
  }

  @Patch(':id')
  @Permissions('accounts.payments.update')
  @ApiOperation({ summary: 'Edit any receipt/payment entry (cash, bank or cheque)' })
  updatePayment(@Param('id') id: string, @Body() dto: EditChequeDto, @CurrentUser() actor: any) {
    return this.service.updatePayment(id, dto, actor?.id);
  }
}