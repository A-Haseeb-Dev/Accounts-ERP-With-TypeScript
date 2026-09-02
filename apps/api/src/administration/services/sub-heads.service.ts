import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { ApiException } from '../../common/exceptions/api.exception';
import { CreateSubHeadDto, UpdateSubHeadDto } from '../dto/accounts.dto';

@Injectable()
export class SubHeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateSubHeadDto, actorId?: string) {
    const head = await this.prisma.headAccount.findUnique({ where: { id: dto.headAccountId } });
    if (!head) throw ApiException.notFound('Head account');

    const existing = await this.prisma.subHead.findFirst({
      where: { code: dto.code, headAccountId: dto.headAccountId },
    });
    if (existing) throw ApiException.duplicateCode('Sub head code');

    const dupName = await this.prisma.subHead.findFirst({
      where: { headAccountId: dto.headAccountId, name: { equals: dto.name, mode: 'insensitive' } },
    });
    if (dupName) throw ApiException.conflict(`A sub head named "${dto.name}" already exists under this head`);

    const item = await this.prisma.subHead.create({
      data: {
        code: dto.code,
        name: dto.name,
        headAccountId: dto.headAccountId,
        description: dto.description ?? null,
        status: dto.status ?? 'active',
      },
      include: { headAccount: true },
    });

    this.audit.record({
      userId: actorId, action: 'CREATE', module: 'SUB_HEAD', entity: 'SubHead',
      entityId: item.id, message: `Sub head ${item.name} (${item.code}) created`,
    });
    return item;
  }

  async findAll(query: { page?: number; pageSize?: number; search?: string; status?: string; headAccountId?: string }) {
    const { page = 1, pageSize = 25, search, status, headAccountId } = query;
    const where: Record<string, unknown> = {};
    if (search) {
      where.OR = [
        { code: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
        { headAccount: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }
    if (status) where.status = status;
    if (headAccountId) where.headAccountId = headAccountId;

    const [items, total] = await Promise.all([
      this.prisma.subHead.findMany({
        where, include: { headAccount: true, _count: { select: { mainAccounts: true } } },
        orderBy: { code: 'asc' }, skip: (page - 1) * pageSize, take: pageSize,
      }),
      this.prisma.subHead.count({ where }),
    ]);
    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async findAllFlat() {
    return this.prisma.subHead.findMany({
      where: { status: 'active' },
      include: { headAccount: true },
      orderBy: { code: 'asc' },
    });
  }

  async findOne(id: string) {
    const item = await this.prisma.subHead.findUnique({
      where: { id },
      include: { headAccount: true, mainAccounts: true },
    });
    if (!item) throw ApiException.notFound('Sub head');
    return item;
  }

  async update(id: string, dto: UpdateSubHeadDto, actorId?: string) {
    const existing = await this.ensureExists(id);
    const parentId = dto.headAccountId ?? existing.headAccountId;
    if (dto.headAccountId) {
      const head = await this.prisma.headAccount.findUnique({ where: { id: dto.headAccountId } });
      if (!head) throw ApiException.notFound('Head account');
    }
    if (dto.code) {
      const dup = await this.prisma.subHead.findFirst({
        where: { code: dto.code, headAccountId: parentId, id: { not: id } },
      });
      if (dup) throw ApiException.duplicateCode('Sub head code');
    }
    if (dto.name) {
      const dupName = await this.prisma.subHead.findFirst({
        where: { headAccountId: parentId, name: { equals: dto.name, mode: 'insensitive' }, id: { not: id } },
      });
      if (dupName) throw ApiException.conflict(`A sub head named "${dto.name}" already exists under this head`);
    }
    const item = await this.prisma.subHead.update({ where: { id }, data: dto });
    this.audit.record({
      userId: actorId, action: 'UPDATE', module: 'SUB_HEAD', entity: 'SubHead',
      entityId: id, message: `Sub head ${item.name} updated`,
    });
    return item;
  }

  async remove(id: string, actorId?: string) {
    const item = await this.ensureExists(id);

    const accounts = await this.prisma.mainAccount.findMany({
      where: { subHeadId: id },
      include: { _count: { select: { voucherEntries: true, customers: true, suppliers: true } } },
    });

    const deletableAccountIds: string[] = [];
    const blockers: string[] = [];
    for (const acc of accounts) {
      const linked = acc._count.voucherEntries + acc._count.customers + acc._count.suppliers;
      if (linked === 0) {
        deletableAccountIds.push(acc.id);
      } else {
        blockers.push(`${acc.code} · ${acc.name} (${linked} link${linked === 1 ? '' : 's'})`);
      }
    }

    if (blockers.length > 0) {
      await this.prisma.subHead.update({ where: { id }, data: { status: 'inactive' } });
      throw ApiException.invalidTransaction(
        `Sub head "${item.name}" is referenced by main account(s) with activity and cannot be deleted. ` +
          `Deactivate or remove them first: ${blockers.join('; ')}`,
      );
    }

    if (deletableAccountIds.length > 0) {
      await this.prisma.mainAccount.deleteMany({ where: { id: { in: deletableAccountIds } } });
    }
    await this.prisma.subHead.delete({ where: { id } });

    this.audit.record({
      userId: actorId, action: 'DELETE', module: 'SUB_HEAD', entity: 'SubHead',
      entityId: id, message: `Sub head ${item.name} deleted with ${deletableAccountIds.length} main account(s)`,
    });
    return { id, deleted: true };
  }

  private async ensureExists(id: string) {
    const item = await this.prisma.subHead.findUnique({ where: { id } });
    if (!item) throw ApiException.notFound('Sub head');
    return item;
  }
}