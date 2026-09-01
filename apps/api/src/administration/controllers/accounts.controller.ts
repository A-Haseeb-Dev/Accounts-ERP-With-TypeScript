import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { HeadAccountsService } from '../services/head-accounts.service';
import { SubHeadsService } from '../services/sub-heads.service';
import { MainAccountsService } from '../services/main-accounts.service';
import { CreateHeadAccountDto, CreateMainAccountDto, CreateSubHeadDto, UpdateHeadAccountDto, UpdateMainAccountDto, UpdateSubHeadDto } from '../dto/accounts.dto';
import { Permissions } from '../../auth/decorators/permissions.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@ApiTags('Head Accounts')
@ApiBearerAuth()
@Controller('head-accounts')
export class HeadAccountsController {
  constructor(private readonly service: HeadAccountsService) {}

  @Post()
  @Permissions('administration.head-accounts.create')
  @ApiOperation({ summary: 'Create a head account' })
  create(@Body() dto: CreateHeadAccountDto, @CurrentUser() actor: any) {
    return this.service.create(dto, actor?.id);
  }

  @Get()
  @Permissions('administration.head-accounts.view')
  @ApiOperation({ summary: 'List head accounts' })
  findAll(@Query('page') page = '1', @Query('pageSize') pageSize = '25', @Query('search') search?: string, @Query('status') status?: string) {
    return this.service.findAll({ page: Number(page), pageSize: Number(pageSize), search, status });
  }

  @Get('flat')
  @Permissions('administration.head-accounts.view')
  @ApiOperation({ summary: 'List all head accounts (flat, for selects)' })
  findAllFlat() {
    return this.service.findAllFlat();
  }

  @Get(':id')
  @Permissions('administration.head-accounts.view')
  @ApiOperation({ summary: 'Get a head account' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @Permissions('administration.head-accounts.update')
  @ApiOperation({ summary: 'Update a head account' })
  update(@Param('id') id: string, @Body() dto: UpdateHeadAccountDto, @CurrentUser() actor: any) {
    return this.service.update(id, dto, actor?.id);
  }

  @Delete(':id')
  @Permissions('administration.head-accounts.delete')
  @ApiOperation({ summary: 'Deactivate a head account' })
  remove(@Param('id') id: string, @CurrentUser() actor: any) {
    return this.service.remove(id, actor?.id);
  }
}

@ApiTags('Sub Heads')
@ApiBearerAuth()
@Controller('sub-heads')
export class SubHeadsController {
  constructor(private readonly service: SubHeadsService) {}

  @Post()
  @Permissions('administration.sub-heads.create')
  @ApiOperation({ summary: 'Create a sub head' })
  create(@Body() dto: CreateSubHeadDto, @CurrentUser() actor: any) {
    return this.service.create(dto, actor?.id);
  }

  @Get()
  @Permissions('administration.sub-heads.view')
  @ApiOperation({ summary: 'List sub heads' })
  findAll(@Query('page') page = '1', @Query('pageSize') pageSize = '25', @Query('search') search?: string, @Query('status') status?: string, @Query('headAccountId') headAccountId?: string) {
    return this.service.findAll({ page: Number(page), pageSize: Number(pageSize), search, status, headAccountId });
  }

  @Get('flat')
  @Permissions('administration.sub-heads.view')
  @ApiOperation({ summary: 'List all sub heads (for selects)' })
  findAllFlat() {
    return this.service.findAllFlat();
  }

  @Get(':id')
  @Permissions('administration.sub-heads.view')
  @ApiOperation({ summary: 'Get a sub head' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @Permissions('administration.sub-heads.update')
  @ApiOperation({ summary: 'Update a sub head' })
  update(@Param('id') id: string, @Body() dto: UpdateSubHeadDto, @CurrentUser() actor: any) {
    return this.service.update(id, dto, actor?.id);
  }

  @Delete(':id')
  @Permissions('administration.sub-heads.delete')
  @ApiOperation({ summary: 'Deactivate a sub head' })
  remove(@Param('id') id: string, @CurrentUser() actor: any) {
    return this.service.remove(id, actor?.id);
  }
}

@ApiTags('Main Accounts')
@ApiBearerAuth()
@Controller('main-accounts')
export class MainAccountsController {
  constructor(private readonly service: MainAccountsService) {}

  @Post()
  @Permissions('administration.main-accounts.create')
  @ApiOperation({ summary: 'Create a main account' })
  create(@Body() dto: CreateMainAccountDto, @CurrentUser() actor: any) {
    return this.service.create(dto, actor?.id);
  }

  @Get()
  @Permissions('administration.main-accounts.view')
  @ApiOperation({ summary: 'List main accounts' })
  findAll(@Query('page') page = '1', @Query('pageSize') pageSize = '25', @Query('search') search?: string, @Query('status') status?: string, @Query('subHeadId') subHeadId?: string, @Query('accountType') accountType?: string) {
    return this.service.findAll({ page: Number(page), pageSize: Number(pageSize), search, status, subHeadId, accountType });
  }

  @Get('flat')
  @Permissions('administration.main-accounts.view')
  @ApiOperation({ summary: 'List all main accounts (for selects)' })
  findAllFlat(@Query('active') active?: string, @Query('type') type?: string) {
    return this.service.findAllFlat(filterFromQuery(active, type));
  }

  @Get(':id')
  @Permissions('administration.main-accounts.view')
  @ApiOperation({ summary: 'Get a main account' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @Permissions('administration.main-accounts.update')
  @ApiOperation({ summary: 'Update a main account' })
  update(@Param('id') id: string, @Body() dto: UpdateMainAccountDto, @CurrentUser() actor: any) {
    return this.service.update(id, dto, actor?.id);
  }

  @Delete(':id')
  @Permissions('administration.main-accounts.delete')
  @ApiOperation({ summary: 'Deactivate a main account' })
  remove(@Param('id') id: string, @CurrentUser() actor: any) {
    return this.service.remove(id, actor?.id);
  }
}

function filterFromQuery(active?: string, type?: string) {
  return {
    active: active === 'true' ? true : undefined,
    type,
  };
}