import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { ApiException } from '../../common/exceptions/api.exception';
import { CreateMainAccountDto, UpdateMainAccountDto } from '../dto/accounts.dto';

@Injectable()
export class MainAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateMainAccountDto, actorId?: string) {
    if (dto.subHeadId) {
      const subHead = await this.prisma.subHead.findUnique({ where: { id: dto.subHeadId } });
      if (!subHead) throw ApiException.notFound('Sub head');
    }

    const existing = await this.prisma.mainAccount.findFirst({ where: { code: dto.code } });
    if (existing) throw ApiException.duplicateCode('Account code');

    const item = await this.prisma.mainAccount.create({
      data: {
        code: dto.code,
        name: dto.name,
        subHeadId: dto.subHeadId ?? null,
        accountType: dto.accountType,
        description: dto.description ?? null,
        openingBalance: dto.openingBalance ?? 0,
        status: dto.status ?? 'active',
      },
      include: { subHead: { include: { headAccount: true } } },
    });

    this.audit.record({
      userId: actorId, action: 'CREATE', module: 'MAIN_ACCOUNT', entity: 'MainAccount',
      entityId: item.id, message: `Main account ${item.name} (${item.code}) created`,
      metadata: { accountType: item.accountType },
    });

    return item;
  }

  async findAll(query: {
    page?: number; pageSize?: number; search?: string; status?: string;
    subHeadId?: string; accountType?: string;
  }) {
    const { page = 1, pageSize = 25, search, status, subHeadId, accountType } = query;
    const where: Record<string, unknown> = {};
    if (search) {
      where.OR = [
        { code: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
        { subHead: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }
    if (status) where.status = status;
    if (subHeadId) where.subHeadId = subHeadId;
    if (accountType) where.accountType = accountType;

    const [items, total] = await Promise.all([
      this.prisma.mainAccount.findMany({
        where,
        include: { subHead: { include: { headAccount: true } } },
        orderBy: { code: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.mainAccount.count({ where }),
    ]);
    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async findAllFlat(filter?: { active?: boolean; type?: string }) {
    return this.prisma.mainAccount.findMany({
      where: {
        ...(filter?.active ? { status: 'active' } : {}),
        ...(filter?.type ? { accountType: filter.type } : {}),
      },
      include: { subHead: { include: { headAccount: true } } },
      orderBy: { code: 'asc' },
    });
  }

  async findOne(id: string) {
    const item = await this.prisma.mainAccount.findUnique({
      where: { id },
      include: { subHead: { include: { headAccount: true } } },
    });
    if (!item) throw ApiException.notFound('Main account');
    return item;
  }

  async update(id: string, dto: UpdateMainAccountDto, actorId?: string) {
    await this.ensureExists(id);
    const item = await this.prisma.mainAccount.update({ where: { id }, data: dto });
    this.audit.record({
      userId: actorId, action: 'UPDATE', module: 'MAIN_ACCOUNT', entity: 'MainAccount',
      entityId: id, message: `Main account ${item.name} updated`,
    });
    return item;
  }

  async remove(id: string, actorId?: string) {
    const item = await this.ensureExists(id);
    const entryCount = await this.prisma.voucherEntry.count({ where: { mainAccountId: id } });
    if (entryCount > 0) {
      throw ApiException.invalidTransaction(
        `Main account "${item.name}" has ${entryCount} voucher entr${entryCount === 1 ? 'y' : 'ies'} and cannot be deleted. Deactivate it instead.`,
      );
    }
    await this.prisma.mainAccount.delete({ where: { id } });
    this.audit.record({
      userId: actorId, action: 'DELETE', module: 'MAIN_ACCOUNT', entity: 'MainAccount',
      entityId: id, message: `Main account ${item.name} deleted`,
    });
    return { id, deleted: true };
  }

  private async ensureExists(id: string) {
    const item = await this.prisma.mainAccount.findUnique({ where: { id } });
    if (!item) throw ApiException.notFound('Main account');
    return item;
  }
}