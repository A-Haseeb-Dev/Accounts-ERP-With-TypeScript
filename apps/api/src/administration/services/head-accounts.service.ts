import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { ApiException } from '../../common/exceptions/api.exception';
import { CreateHeadAccountDto, UpdateHeadAccountDto } from '../dto/accounts.dto';

@Injectable()
export class HeadAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateHeadAccountDto, actorId?: string) {
    const existing = await this.prisma.headAccount.findUnique({ where: { code: dto.code } });
    if (existing) throw ApiException.duplicateCode('Account code');

    const item = await this.prisma.headAccount.create({
      data: { code: dto.code, name: dto.name, description: dto.description ?? null, status: dto.status ?? 'active' },
    });

    this.audit.record({
      userId: actorId, action: 'CREATE', module: 'HEAD_ACCOUNT', entity: 'HeadAccount',
      entityId: item.id, message: `Head account ${item.name} (${item.code}) created`,
    });

    return item;
  }

  async findAll(query: { page?: number; pageSize?: number; search?: string; status?: string }) {
    const { page = 1, pageSize = 25, search, status } = query;
    const where: Record<string, unknown> = {};
    if (search) {
      where.OR = [
        { code: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (status) where.status = status;

    const [items, total] = await Promise.all([
      this.prisma.headAccount.findMany({
        where, orderBy: { code: 'asc' }, skip: (page - 1) * pageSize, take: pageSize,
        include: { _count: { select: { subHeads: true } } },
      }),
      this.prisma.headAccount.count({ where }),
    ]);
    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async findAllFlat() {
    return this.prisma.headAccount.findMany({ orderBy: { code: 'asc' } });
  }

  async findOne(id: string) {
    const item = await this.prisma.headAccount.findUnique({
      where: { id },
      include: { subHeads: { include: { mainAccounts: true } } },
    });
    if (!item) throw ApiException.notFound('Head account');
    return item;
  }

  async update(id: string, dto: UpdateHeadAccountDto, actorId?: string) {
    await this.ensureExists(id);
    const item = await this.prisma.headAccount.update({ where: { id }, data: dto });
    this.audit.record({
      userId: actorId, action: 'UPDATE', module: 'HEAD_ACCOUNT', entity: 'HeadAccount',
      entityId: id, message: `Head account ${item.name} updated`,
    });
    return item;
  }

  async remove(id: string, actorId?: string) {
    const item = await this.ensureExists(id);
    const subHeadCount = await this.prisma.subHead.count({ where: { headAccountId: id } });
    if (subHeadCount > 0) {
      throw ApiException.invalidTransaction(
        `Head account "${item.name}" has ${subHeadCount} sub head(s) and cannot be deleted`,
      );
    }
    await this.prisma.headAccount.update({ where: { id }, data: { status: 'inactive' } });
    this.audit.record({
      userId: actorId, action: 'DEACTIVATE', module: 'HEAD_ACCOUNT', entity: 'HeadAccount',
      entityId: id, message: `Head account ${item.name} deactivated`,
    });
    return { id, status: 'inactive' };
  }

  private async ensureExists(id: string) {
    const item = await this.prisma.headAccount.findUnique({ where: { id } });
    if (!item) throw ApiException.notFound('Head account');
    return item;
  }
}