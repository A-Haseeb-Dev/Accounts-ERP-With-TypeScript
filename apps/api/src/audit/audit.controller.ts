import { Body, Controller, Get, HttpCode, HttpStatus, HttpException, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { AuditCleanupService } from './audit-cleanup.service';
import { PrismaService } from '../prisma/prisma.service';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { ApiException } from '../common/exceptions/api.exception';

const MAX_PAGE_SIZE = 200;

@ApiTags('Audit Logs')
@ApiBearerAuth()
@Controller('system/audit-logs')
export class AuditController {
  constructor(
    private readonly audit: AuditService,
    private readonly prisma: PrismaService,
    private readonly cleanup: AuditCleanupService,
  ) {}

  @Get()
  @Permissions('system.audit.view')
  @ApiOperation({ summary: 'List audit logs with filters' })
  async findAll(
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '25',
    @Query('module') module?: string,
    @Query('action') action?: string,
    @Query('userId') userId?: string,
    @Query('entityId') entityId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('search') search?: string,
  ) {
    const parsedPage = Math.max(1, Number(page) || 1);
    const parsedSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(pageSize) || 25));

    const where: Record<string, unknown> = {};

    if (module) where.module = module;
    if (action) where.action = action;
    if (userId) where.userId = userId;
    if (entityId) where.entityId = entityId;
    if (from || to) {
      where.createdAt = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      };
    }
    if (search) {
      where.message = { contains: search, mode: 'insensitive' };
    }

    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: {
          user: { select: { id: true, fullName: true, username: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (parsedPage - 1) * parsedSize,
        take: parsedSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      items,
      total,
      page: parsedPage,
      pageSize: parsedSize,
      totalPages: Math.ceil(total / parsedSize),
    };
  }

  @Get('stats')
  @Permissions('system.audit.view')
  @ApiOperation({ summary: 'Audit log volume summary and retention window' })
  async stats() {
    const [total, newest, oldest] = await Promise.all([
      this.prisma.auditLog.count(),
      this.prisma.auditLog.findFirst({ orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
      this.prisma.auditLog.findFirst({ orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
    ]);
    const retentionDays = await this.cleanup.readRetentionDays();
    const cutOff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const expiring = await this.prisma.auditLog.count({ where: { createdAt: { lt: cutOff } } });
    return { total, oldest: oldest?.createdAt, newest: newest?.createdAt, retentionDays, expiring };
  }

  @Post('purge')
  @HttpCode(HttpStatus.OK)
  @Permissions('system.audit.purge')
  @ApiOperation({ summary: 'Purge audit logs older than N days (default: retention setting)' })
  async purge(@Body('olderThanDays') olderThanDays?: number) {
    let override: number | undefined;
    if (olderThanDays !== undefined) {
      if (!Number.isFinite(olderThanDays) || olderThanDays < 30 || olderThanDays > 3650) {
        throw ApiException.validation('olderThanDays must be a number between 30 and 3650');
      }
      override = Math.floor(olderThanDays);
    }
    const result = await this.cleanup.purgeExpired(override);
    return {
      deleted: result.deleted,
      retentionDays: result.retentionDays,
      message:
        result.deleted > 0
          ? `Purged ${result.deleted} audit log(s) older than ${result.retentionDays} days`
          : `No audit logs older than ${result.retentionDays} days to purge`,
    };
  }
}