import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { ApiException } from '../../common/exceptions/api.exception';
import { AccountCodeService } from './account-code.service';
import { CreateHeadAccountDto, UpdateHeadAccountDto } from '../dto/accounts.dto';

@Injectable()
export class HeadAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly codes: AccountCodeService,
  ) {}

  /**
   * A head account's code is the anchor of the whole subtree below it, so the
   * code and the row are written together — a half-created head would consume a
   * code in the series and leave its sub heads numbering against a head that
   * does not exist.
   */
  async create(dto: CreateHeadAccountDto, actorId?: string) {
    const dupName = await this.prisma.headAccount.findFirst({
      where: { name: { equals: dto.name, mode: 'insensitive' } },
    });
    if (dupName) throw ApiException.conflict(`A head account named "${dto.name}" already exists`);

    const item = await this.prisma.$transaction(async (tx) => {
      const code = await this.codes.nextHeadCode(dto.accountType, tx);
      return tx.headAccount.create({
        data: { code, name: dto.name, description: dto.description ?? null, status: dto.status ?? 'active' },
      });
    });

    this.audit.record({
      userId: actorId, action: 'CREATE', module: 'HEAD_ACCOUNT', entity: 'HeadAccount',
      entityId: item.id, message: `Head account ${item.name} (${item.code}) created`,
    });

    return item;
  }

  /** The code the next head of this type would be assigned, for the create form. */
  async previewCode(accountType: CreateHeadAccountDto['accountType']) {
    return this.codes.previewHeadCode(accountType);
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
    if (dto.name) {
      const dupName = await this.prisma.headAccount.findFirst({
        where: { name: { equals: dto.name, mode: 'insensitive' }, id: { not: id } },
      });
      if (dupName) throw ApiException.conflict(`A head account named "${dto.name}" already exists`);
    }
    // The code and therefore the account type are immutable: every sub head and
    // account below this head carries the code in its own, and renumbering a
    // live head would silently restate a whole statement. Fields are listed
    // rather than spreading `dto` so immutability does not rest on the
    // validation pipe alone.
    const item = await this.prisma.headAccount.update({
      where: { id },
      data: { name: dto.name, description: dto.description, status: dto.status },
    });
    this.audit.record({
      userId: actorId, action: 'UPDATE', module: 'HEAD_ACCOUNT', entity: 'HeadAccount',
      entityId: id, message: `Head account ${item.name} updated`,
    });
    return item;
  }

  async remove(id: string, actorId?: string) {
    const item = await this.ensureExists(id);

    const subHeads = await this.prisma.subHead.findMany({ where: { headAccountId: id } });
    const mainAccountIds: string[] = [];
    const blockers: string[] = [];

    for (const sub of subHeads) {
      const accounts = await this.prisma.mainAccount.findMany({
        where: { subHeadId: sub.id },
        include: {
          _count: { select: { voucherEntries: true, customers: true, suppliers: true } },
        },
      });

      for (const acc of accounts) {
        const linked = acc._count.voucherEntries + acc._count.customers + acc._count.suppliers;
        mainAccountIds.push(acc.id);
        if (linked > 0) {
          blockers.push(`${acc.code} · ${acc.name} (${linked} link${linked === 1 ? '' : 's'})`);
        }
      }
    }

    if (blockers.length > 0) {
      throw ApiException.deleteBlocked(`Head account "${item.name}"`, blockers);
    }

    if (mainAccountIds.length > 0) {
      await this.prisma.mainAccount.deleteMany({ where: { id: { in: mainAccountIds } } });
    }
    await this.prisma.subHead.deleteMany({ where: { headAccountId: id } });
    await this.prisma.headAccount.delete({ where: { id } });

    this.audit.record({
      userId: actorId, action: 'DELETE', module: 'HEAD_ACCOUNT', entity: 'HeadAccount',
      entityId: id, message: `Head account ${item.name} deleted with ${subHeads.length} sub head(s)`,
    });
    return { id, deleted: true };
  }

  private async ensureExists(id: string) {
    const item = await this.prisma.headAccount.findUnique({ where: { id } });
    if (!item) throw ApiException.notFound('Head account');
    return item;
  }
}