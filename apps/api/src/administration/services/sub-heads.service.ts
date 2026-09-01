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
    await this.ensureExists(id);
    if (dto.headAccountId) {
      const head = await this.prisma.headAccount.findUnique({ where: { id: dto.headAccountId } });
      if (!head) throw ApiException.notFound('Head account');
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
    const count = await this.prisma.mainAccount.count({ where: { subHeadId: id } });
    if (count > 0) {
      throw ApiException.invalidTransaction(
        `Sub head "${item.name}" has ${count} main account(s) and cannot be deleted`,
      );
    }
    await this.prisma.subHead.update({ where: { id }, data: { status: 'inactive' } });
    this.audit.record({
      userId: actorId, action: 'DEACTIVATE', module: 'SUB_HEAD', entity: 'SubHead',
      entityId: id, message: `Sub head ${item.name} deactivated`,
    });
    return { id, status: 'inactive' };
  }

  private async ensureExists(id: string) {
    const item = await this.prisma.subHead.findUnique({ where: { id } });
    if (!item) throw ApiException.notFound('Sub head');
    return item;
  }
}