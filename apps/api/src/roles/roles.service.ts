import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ApiException } from '../common/exceptions/api.exception';
import { CreateRoleDto, UpdateRoleDto } from './dto/roles.dto';

// Only these roles are allowed to create, edit, delete or assign a protected role.
const SYSTEM_ADMIN_ROLES = ['Developer', 'Super Admin'] as const;

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private isSystemAdmin(actorRoles: string[] = []): boolean {
    return actorRoles.some((r) =>
      (SYSTEM_ADMIN_ROLES as readonly string[]).includes(r),
    );
  }

  private assertCanManageProtected(actorRoles: string[] = [], roleProtected: boolean) {
    if (roleProtected && !this.isSystemAdmin(actorRoles)) {
      throw ApiException.forbidden(
        'Only a Developer or Super Admin can manage the Developer, Super Admin or other protected roles',
      );
    }
  }

  async create(dto: CreateRoleDto, actorId?: string, actorRoles: string[] = []) {
    const existing = await this.prisma.role.findFirst({ where: { name: dto.name } });
    if (existing) throw ApiException.duplicateCode('Role name');

    // Only a Developer or Super Admin may create a protected role in the first place.
    if (dto.protected) this.assertCanManageProtected(actorRoles, true);

    const role = await this.prisma.role.create({
      data: {
        name: dto.name,
        description: dto.description ?? null,
        isSystem: dto.isSystem ?? false,
        protected: dto.protected ?? false,
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
      message: `Role ${role.name} created${role.protected ? ' (protected)' : ''}`,
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

  async findFlat() {
    return this.prisma.role.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
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

  async update(id: string, dto: UpdateRoleDto, actorId?: string, actorRoles: string[] = []) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw ApiException.notFound('Role');
    if (role.isSystem && dto.name && dto.name !== role.name) {
      throw ApiException.invalidTransaction('System roles cannot be renamed');
    }

    // Protected roles can only be changed by a Developer or Super Admin.
    // A non-admin may also never un-protect an existing protected role.
    if (role.protected || dto.protected) this.assertCanManageProtected(actorRoles, true);

    if (dto.permissionIds) {
      if (role.protected) this.assertCanManageProtected(actorRoles, true);
      await this.prisma.rolePermission.deleteMany({ where: { roleId: id } });
      await this.prisma.rolePermission.createMany({
        data: dto.permissionIds.map((permissionId) => ({ roleId: id, permissionId })),
        skipDuplicates: true,
      });
    }

    const updated = await this.prisma.role.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        ...(dto.protected !== undefined ? { protected: dto.protected } : {}),
      },
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

  async remove(id: string, actorId?: string, actorRoles: string[] = []) {
    const role = await this.prisma.role.findUnique({ where: { id }, include: { _count: { select: { users: true } } } });
    if (!role) throw ApiException.notFound('Role');
    if (role.isSystem) throw ApiException.invalidTransaction('System roles cannot be deleted');
    if (role.protected) this.assertCanManageProtected(actorRoles, true);
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

  async assignPermissions(id: string, permissionIds: string[], actorId?: string, actorRoles: string[] = []) {
    const role = await this.prisma.role.findUnique({ where: { id } });
    if (!role) throw ApiException.notFound('Role');
    if (role.protected) this.assertCanManageProtected(actorRoles, true);

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