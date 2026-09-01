import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RolesService } from './roles.service';
import { CreateRoleDto, UpdateRoleDto } from './dto/roles.dto';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Roles')
@ApiBearerAuth()
@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Post()
  @Permissions('roles.manage')
  @ApiOperation({ summary: 'Create a role' })
  create(@Body() dto: CreateRoleDto, @CurrentUser() actor: any) {
    return this.rolesService.create(dto, actor?.id);
  }

  @Get()
  @Permissions('roles.view')
  @ApiOperation({ summary: 'List roles' })
  findAll() {
    return this.rolesService.findAll();
  }

  @Get(':id')
  @Permissions('roles.view')
  @ApiOperation({ summary: 'Get a role by id' })
  findOne(@Param('id') id: string) {
    return this.rolesService.findOne(id);
  }

  @Patch(':id')
  @Permissions('roles.manage')
  @ApiOperation({ summary: 'Update a role' })
  update(@Param('id') id: string, @Body() dto: UpdateRoleDto, @CurrentUser() actor: any) {
    return this.rolesService.update(id, dto, actor?.id);
  }

  @Delete(':id')
  @Permissions('roles.manage')
  @ApiOperation({ summary: 'Delete a role' })
  remove(@Param('id') id: string, @CurrentUser() actor: any) {
    return this.rolesService.remove(id, actor?.id);
  }

  @Post(':id/permissions')
  @Permissions('roles.manage')
  @ApiOperation({ summary: 'Assign permissions to a role' })
  assignPermissions(
    @Param('id') id: string,
    @Body() body: { permissionIds: string[] },
    @CurrentUser() actor: any,
  ) {
    return this.rolesService.assignPermissions(id, body.permissionIds, actor?.id);
  }
}