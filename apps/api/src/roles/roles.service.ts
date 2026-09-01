import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ApiException } from '../common/exceptions/api.exception';
import { CreateRoleDto, UpdateRoleDto } from './dto/roles.dto';

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateRoleDto, actorId?: string) {
    const existing = await this.prisma.role.findFirst({ where: { name: dto.name } });
    if (existing) throw ApiException.duplicateCode('Role name');

    const role = await this.prisma.role.create({
      data: {
        name: dto.name,
        description: dto.description ?? null,
        isSystem: dto.isSystem ?? false,
        permissions: dto.permissionIds?.length
          ? { create: dto.permissionIds.map((permissionId) => ({ permissionId })) }
          : undefined,
      },
      include: { permissions: { include: { permission: true } } },
    });

    this.audit.record({
      userId: actorId,
      action: 'CREATE',
      module: 'ROLE',
      entity: 'Role',
      entityId: role.id,
      message: `Role ${role.name} created`,
    });

    return role;
  }

  async findAll() {
    const roles = await this.prisma.role.findMany({
      include: {
        permissions: { include: { permission: true } },
        _count: { select: { users: true } },
      },
      orderBy: { name: 'asc' },
    });
    return roles;
  }

  async findOne(id: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: {
        permissions: { include: { permission: true } },
        users: { include: { user: { select: { id: true, fullName: true, username: true } } } },
      },
    });
    if (!role) throw ApiException.notFound('Role');
    return role;
  }

  async update(id: string, dto: UpdateRoleDto, actorId?: string) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw ApiException.notFound('Role');
    if (role.isSystem && dto.name && dto.name !== role.name) {
      throw ApiException.invalidTransaction('System roles cannot be renamed');
    }

    if (dto.permissionIds) {
      await this.prisma.rolePermission.deleteMany({ where: { roleId: id } });
      await this.prisma.rolePermission.createMany({
        data: dto.permissionIds.map((permissionId) => ({ roleId: id, permissionId })),
        skipDuplicates: true,
      });
    }

    const updated = await this.prisma.role.update({
      where: { id },
      data: { name: dto.name, description: dto.description },
      include: { permissions: { include: { permission: true } } },
    });

    this.audit.record({
      userId: actorId,
      action: 'UPDATE',
      module: 'ROLE',
      entity: 'Role',
      entityId: id,
      message: `Role ${updated.name} updated`,
    });

    return updated;
  }

  async remove(id: string, actorId?: string) {
    const role = await this.prisma.role.findUnique({ where: { id }, include: { _count: { select: { users: true } } } });
    if (!role) throw ApiException.notFound('Role');
    if (role.isSystem) throw ApiException.invalidTransaction('System roles cannot be deleted');
    if (role._count.users > 0) {
      throw ApiException.invalidTransaction(`Role "${role.name}" is assigned to ${role._count.users} user(s) and cannot be deleted`);
    }

    await this.prisma.rolePermission.deleteMany({ where: { roleId: id } });
    await this.prisma.role.delete({ where: { id } });

    this.audit.record({
      userId: actorId,
      action: 'DELETE',
      module: 'ROLE',
      entity: 'Role',
      entityId: id,
      message: `Role ${role.name} deleted`,
    });

    return { id, deleted: true };
  }

  async assignPermissions(id: string, permissionIds: string[], actorId?: string) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw ApiException.notFound('Role');

    await this.prisma.rolePermission.deleteMany({ where: { roleId: id } });
    await this.prisma.rolePermission.createMany({
      data: permissionIds.map((permissionId) => ({ roleId: id, permissionId })),
      skipDuplicates: true,
    });

    this.audit.record({
      userId: actorId,
      action: 'PERMISSIONS_CHANGED',
      module: 'ROLE',
      entity: 'Role',
      entityId: id,
      message: `Permissions changed for role ${role.name}`,
      metadata: { permissionCount: permissionIds.length },
    });

    return this.findOne(id);
  }
}