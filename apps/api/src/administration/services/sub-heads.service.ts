import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { ApiException } from '../../common/exceptions/api.exception';
import { AccountCodeService } from './account-code.service';
import { CreateSubHeadDto, UpdateSubHeadDto } from '../dto/accounts.dto';

@Injectable()
export class SubHeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly codes: AccountCodeService,
  ) {}

  async create(dto: CreateSubHeadDto, actorId?: string) {
    const head = await this.prisma.headAccount.findUnique({ where: { id: dto.headAccountId } });
    if (!head) throw ApiException.notFound('Head account');

    const dupName = await this.prisma.subHead.findFirst({
      where: { headAccountId: dto.headAccountId, name: { equals: dto.name, mode: 'insensitive' } },
    });
    if (dupName) throw ApiException.conflict(`A sub head named "${dto.name}" already exists under this head`);

    const item = await this.prisma.$transaction(async (tx) => {
      const code = await this.codes.nextSubHeadCode(head.code, tx);
      return tx.subHead.create({
        data: {
          code,
          name: dto.name,
          headAccountId: dto.headAccountId,
          description: dto.description ?? null,
          status: dto.status ?? 'active',
        },
        include: { headAccount: true },
      });
    });

    this.audit.record({
      userId: actorId, action: 'CREATE', module: 'SUB_HEAD', entity: 'SubHead',
      entityId: item.id, message: `Sub head ${item.name} (${item.code}) created`,
    });
    return item;
  }

  async previewCode(headAccountId: string) {
    const head = await this.prisma.headAccount.findUnique({ where: { id: headAccountId } });
    if (!head) throw ApiException.notFound('Head account');
    return this.codes.previewSubHeadCode(head.code);
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
    const reparenting = dto.headAccountId !== undefined && dto.headAccountId !== existing.headAccountId;

    let targetHead = null;
    if (dto.headAccountId) {
      targetHead = await this.prisma.headAccount.findUnique({ where: { id: dto.headAccountId } });
      if (!targetHead) throw ApiException.notFound('Head account');
    }

    if (dto.name) {
      const dupName = await this.prisma.subHead.findFirst({
        where: { headAccountId: parentId, name: { equals: dto.name, mode: 'insensitive' }, id: { not: id } },
      });
      if (dupName) throw ApiException.conflict(`A sub head named "${dto.name}" already exists under this head`);
    }

    const item = reparenting
      ? await this.reparent(id, dto, targetHead!.code, targetHead!.id)
      : await this.prisma.subHead.update({
          where: { id },
          data: { name: dto.name, description: dto.description, status: dto.status },
        });

    this.audit.record({
      userId: actorId, action: 'UPDATE', module: 'SUB_HEAD', entity: 'SubHead',
      entityId: id, message: `Sub head ${item.name} updated${reparenting ? ` (moved, renumbered to ${item.code})` : ''}`,
    });
    return this.prisma.subHead.findUnique({ where: { id }, include: { headAccount: true } });
  }

  /**
   * Moves a sub head to a different head account and renumbers it.
   *
   * A sub head code carries its parent's code (`A1-01`), so moving one from
   * `A1` to `L2` has to issue a new code — and every account beneath it carries
   * the sub head code in its own, so those are renumbered in step. Doing it in
   * one transaction means the tree is never visible with codes that disagree
   * with where it actually sits.
   *
   * Renumbering only changes labels. Voucher entries, balances and links all
   * reference account ids, so the ledger is untouched; only the code shown on
   * reports moves, and the account type follows the new head.
   */
  private async reparent(
    id: string,
    dto: UpdateSubHeadDto,
    targetHeadCode: string,
    targetHeadId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const code = await this.codes.nextSubHeadCode(targetHeadCode, tx);
      const accountType = this.codes.accountTypeForHeadCode(targetHeadCode);

      // Oldest first, so relative order — and therefore which account keeps
      // which serial — is preserved across the move.
      const accounts = await tx.mainAccount.findMany({
        where: { subHeadId: id },
        orderBy: { code: 'asc' },
        select: { id: true },
      });
      for (const acc of accounts) {
        const nextCode = await this.codes.nextMainAccountCode(code, tx);
        await tx.mainAccount.update({
          where: { id: acc.id },
          data: { code: nextCode, accountType },
        });
      }

      return tx.subHead.update({
        where: { id },
        data: {
          headAccountId: targetHeadId,
          code,
          name: dto.name,
          description: dto.description,
          status: dto.status,
        },
      });
    });
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
      throw ApiException.deleteBlocked(`Sub head "${item.name}"`, blockers);
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