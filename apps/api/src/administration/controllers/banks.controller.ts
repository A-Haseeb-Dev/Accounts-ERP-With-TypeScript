import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { BanksService } from '../services/banks.service';
import { CreateBankAccountDto, UpdateBankAccountDto } from '../dto/banks.dto';
import { Permissions } from '../../auth/decorators/permissions.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@ApiTags('Bank Accounts')
@ApiBearerAuth()
@Controller('banks')
export class BanksController {
  constructor(private readonly service: BanksService) {}

  @Post()
  @Permissions('administration.main-accounts.create')
  @ApiOperation({ summary: 'Create a bank account' })
  create(@Body() dto: CreateBankAccountDto, @CurrentUser() actor: any) {
    return this.service.create(dto, actor?.id);
  }

  @Get()
  @Permissions('administration.main-accounts.view')
  @ApiOperation({ summary: 'List bank accounts' })
  findAll(@Query('page') page = '1', @Query('pageSize') pageSize = '25', @Query('search') search?: string, @Query('status') status?: string) {
    return this.service.findAll({ page: Number(page), pageSize: Number(pageSize), search, status });
  }

  @Get('flat')
  @Permissions('administration.main-accounts.view')
  @ApiOperation({ summary: 'List all bank accounts (flat, for selects)' })
  findAllFlat() {
    return this.service.findAllFlat();
  }

  @Get(':id')
  @Permissions('administration.main-accounts.view')
  @ApiOperation({ summary: 'Get a bank account' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @Permissions('administration.main-accounts.update')
  @ApiOperation({ summary: 'Update a bank account' })
  update(@Param('id') id: string, @Body() dto: UpdateBankAccountDto, @CurrentUser() actor: any) {
    return this.service.update(id, dto, actor?.id);
  }

  @Delete(':id')
  @Permissions('administration.main-accounts.delete')
  @ApiOperation({ summary: 'Delete a bank account' })
  remove(@Param('id') id: string, @CurrentUser() actor: any) {
    return this.service.remove(id, actor?.id);
  }
}