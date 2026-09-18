import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ApiException } from '../common/exceptions/api.exception';
import { CreateUserDto, UpdateUserDto } from './dto/users.dto';

const DEVELOPER_ROLE = 'Developer';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // The Developer role is a vendor-level privilege that bypasses all permission
  // checks, so only an existing Developer may grant it or manage Developer
  // accounts. Everyone else with `users.manage` can still create/edit/delete
  // ordinary users.
  private async assertDeveloperBoundary(opts: {
    actorRoles: string[];
    requestedRoleIds?: string[];
    targetRoleNames?: string[];
  }) {
    if (opts.actorRoles.includes(DEVELOPER_ROLE)) return;

    if (opts.targetRoleNames?.includes(DEVELOPER_ROLE)) {
      throw ApiException.forbidden('Only a Developer can manage a Developer account');
    }

    if (opts.requestedRoleIds?.length) {
      const roles = await this.prisma.role.findMany({
        where: { id: { in: opts.requestedRoleIds } },
        select: { name: true },
      });
      if (roles.some((r) => r.name === DEVELOPER_ROLE)) {
        throw ApiException.forbidden('Only a Developer can assign the Developer role');
      }
    }
  }

  async create(dto: CreateUserDto, actorId?: string, actorRoles: string[] = []) {
    const existing = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (existing) {
      throw ApiException.duplicateCode('Username');
    }

    await this.assertDeveloperBoundary({ actorRoles, requestedRoleIds: dto.roleIds });

    const passwordHash = await argon2.hash(dto.password);

    const user = await this.prisma.user.create({
      data: {
        fullName: dto.fullName,
        username: dto.username,
        email: dto.email ?? null,
        phone: dto.phone ?? null,
        passwordHash,
        roles: dto.roleIds?.length
          ? {
              create: dto.roleIds.map((roleId) => ({ roleId })),
            }
          : undefined,
      },
      include: { roles: { include: { role: true } } },
    });

    this.audit.record({
      userId: actorId,
      action: 'CREATE',
      module: 'USER',
      entity: 'User',
      entityId: user.id,
      message: `User ${user.username} created`,
      metadata: { username: user.username },
    });

    return this.sanitize(user);
  }

  async findAll(query: {
    page?: number;
    pageSize?: number;
    search?: string;
    status?: string;
    roleId?: string;
  }) {
    const { page = 1, pageSize = 25, search, status, roleId } = query;
    const where: Record<string, unknown> = {};

    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { username: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (status) where.status = status;
    if (roleId) where.roles = { some: { roleId } };

    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        include: { roles: { include: { role: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      items: items.map((u) => this.sanitize(u)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { roles: { include: { role: true } } },
    });
    if (!user) throw ApiException.notFound('User');
    return this.sanitize(user);
  }

  async update(id: string, dto: UpdateUserDto, actorId?: string, actorRoles: string[] = []) {
    const existing = await this.prisma.user.findUnique({
      where: { id },
      include: { roles: { include: { role: true } } },
    });
    if (!existing) throw ApiException.notFound('User');

    await this.assertDeveloperBoundary({
      actorRoles,
      requestedRoleIds: dto.roleIds,
      targetRoleNames: existing.roles?.map((r: any) => r.role.name),
    });

    const data: Record<string, unknown> = {
      fullName: dto.fullName,
      email: dto.email ?? null,
      phone: dto.phone ?? null,
      status: dto.status,
    };
    if (dto.password) {
      data.passwordHash = await argon2.hash(dto.password);
      data.tokenVersion = { increment: 1 };
    }

    if (dto.roleIds) {
      await this.prisma.userRole.deleteMany({ where: { userId: id } });
      await this.prisma.userRole.createMany({
        data: dto.roleIds.map((roleId) => ({ userId: id, roleId })),
        skipDuplicates: true,
      });
    }

    const user = await this.prisma.user.update({
      where: { id },
      data,
      include: { roles: { include: { role: true } } },
    });

    this.audit.record({
      userId: actorId,
      action: 'UPDATE',
      module: 'USER',
      entity: 'User',
      entityId: user.id,
      message: `User ${user.username} updated`,
      metadata: { fields: Object.keys(dto) },
    });

    return this.sanitize(user);
  }

  async remove(id: string, actorId?: string, actorRoles: string[] = []) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { roles: { include: { role: true } } },
    });
    if (!user) throw ApiException.notFound('User');
    if (user.id === actorId) {
      throw ApiException.invalidTransaction('You cannot delete your own account');
    }

    await this.assertDeveloperBoundary({
      actorRoles,
      targetRoleNames: user.roles?.map((r: any) => r.role.name),
    });

    await this.prisma.user.delete({ where: { id } });

    this.audit.record({
      userId: actorId,
      action: 'DELETE',
      module: 'USER',
      entity: 'User',
      entityId: id,
      message: `User ${user.username} deleted permanently`,
    });

    return { id, deleted: true };
  }

  private sanitize(user: any) {
    const { passwordHash: _passwordHash, ...safe } = user;
    return safe;
  }
}