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

    const dupName = await this.prisma.headAccount.findFirst({
      where: { name: { equals: dto.name, mode: 'insensitive' } },
    });
    if (dupName) throw ApiException.conflict(`A head account named "${dto.name}" already exists`);

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
    if (dto.code) {
      const dup = await this.prisma.headAccount.findFirst({ where: { code: dto.code, id: { not: id } } });
      if (dup) throw ApiException.duplicateCode('Account code');
    }
    if (dto.name) {
      const dupName = await this.prisma.headAccount.findFirst({
        where: { name: { equals: dto.name, mode: 'insensitive' }, id: { not: id } },
      });
      if (dupName) throw ApiException.conflict(`A head account named "${dto.name}" already exists`);
    }
    const item = await this.prisma.headAccount.update({ where: { id }, data: dto });
    this.audit.record({
      userId: actorId, action: 'UPDATE', module: 'HEAD_ACCOUNT', entity: 'HeadAccount',
      entityId: id, message: `Head account ${item.name} updated`,
    });
    return item;
  }

  async remove(id: string, actorId?: string) {
    const item = await this.ensureExists(id);

    const subHeads = await this.prisma.subHead.findMany({ where: { headAccountId: id } });
    const blockers: string[] = [];
    const deletableSubHeadIds: string[] = [];

    for (const sub of subHeads) {
      const accounts = await this.prisma.mainAccount.findMany({
        where: { subHeadId: sub.id },
        include: {
          _count: { select: { voucherEntries: true, customers: true, suppliers: true } },
        },
      });

      const deletableAccountIds: string[] = [];
      let subBlocked = false;
      for (const acc of accounts) {
        const linked = acc._count.voucherEntries + acc._count.customers + acc._count.suppliers;
        if (linked === 0) {
          deletableAccountIds.push(acc.id);
        } else {
          subBlocked = true;
          blockers.push(`${acc.code} · ${acc.name} (${linked} link${linked === 1 ? '' : 's'})`);
        }
      }

      if (deletableAccountIds.length > 0) {
        await this.prisma.mainAccount.deleteMany({ where: { id: { in: deletableAccountIds } } });
      }
      if (!subBlocked) {
        deletableSubHeadIds.push(sub.id);
      }
    }

    if (blockers.length > 0) {
      // Preserve the structure (soft-deactivate) but tell the user exactly
      // which main accounts are preventing deletion.
      await this.prisma.headAccount.update({ where: { id }, data: { status: 'inactive' } });
      throw ApiException.invalidTransaction(
        `Head account "${item.name}" is referenced by main account(s) with activity and cannot be deleted. ` +
          `Deactivate or remove them first: ${blockers.join('; ')}`,
      );
    }

    await this.prisma.subHead.deleteMany({ where: { id: { in: deletableSubHeadIds } } });
    await this.prisma.headAccount.delete({ where: { id } });

    this.audit.record({
      userId: actorId, action: 'DELETE', module: 'HEAD_ACCOUNT', entity: 'HeadAccount',
      entityId: id, message: `Head account ${item.name} deleted with ${deletableSubHeadIds.length} sub head(s)`,
    });
    return { id, deleted: true };
  }

  private async ensureExists(id: string) {
    const item = await this.prisma.headAccount.findUnique({ where: { id } });
    if (!item) throw ApiException.notFound('Head account');
    return item;
  }
}