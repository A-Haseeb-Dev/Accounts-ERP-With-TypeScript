import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { VouchersService } from './vouchers.service';
import { CreateVoucherDto, CancelVoucherDto } from './dto/vouchers.dto';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Vouchers')
@ApiBearerAuth()
@Controller('vouchers')
export class VouchersController {
  constructor(private readonly service: VouchersService) {}

  @Post()
  @Permissions('accounts.vouchers.create')
  @ApiOperation({ summary: 'Create a voucher (journal / credit / debit)' })
  create(@Body() dto: CreateVoucherDto, @CurrentUser() actor: any) {
    return this.service.create(dto, actor?.id);
  }

  @Get()
  @Permissions('accounts.vouchers.view')
  @ApiOperation({ summary: 'List vouchers' })
  findAll(
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '25',
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('voucherType') voucherType?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.findAll({ page: Number(page), pageSize: Number(pageSize), search, status, voucherType, from, to });
  }

  @Get('cash-book')
  @Permissions('accounts.cashbook.view')
  @ApiOperation({ summary: 'Cash book with running balance' })
  cashBook(
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '25',
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('search') search?: string,
  ) {
    return this.service.cashBook({ page: Number(page), pageSize: Number(pageSize), from, to, search });
  }

  @Get(':id')
  @Permissions('accounts.vouchers.view')
  @ApiOperation({ summary: 'Get a voucher' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post(':id/post')
  @Permissions('accounts.vouchers.post')
  @ApiOperation({ summary: 'Post a draft voucher' })
  post(@Param('id') id: string, @CurrentUser() actor: any) {
    return this.service.post(id, actor?.id);
  }

  @Delete(':id/cancel')
  @Permissions('accounts.vouchers.cancel')
  @ApiOperation({ summary: 'Cancel a voucher with reason' })
  cancel(@Param('id') id: string, @Body() dto: CancelVoucherDto, @CurrentUser() actor: any) {
    return this.service.cancel(id, dto.reason, actor?.id);
  }
}