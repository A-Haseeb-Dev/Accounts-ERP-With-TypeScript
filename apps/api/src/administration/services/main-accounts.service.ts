import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { AccountingService } from '../../common/services/accounting.service';
import { ApiException } from '../../common/exceptions/api.exception';
import { CreateMainAccountDto, UpdateMainAccountDto } from '../dto/accounts.dto';

@Injectable()
export class MainAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly accounting: AccountingService,
  ) {}

  async create(dto: CreateMainAccountDto, actorId?: string) {
    const subHead = await this.prisma.subHead.findUnique({
      where: { id: dto.subHeadId },
      include: { headAccount: true },
    });
    if (!subHead) throw ApiException.notFound('Sub head');

    const existing = await this.prisma.mainAccount.findFirst({ where: { code: dto.code } });
    if (existing) throw ApiException.duplicateCode('Account code');

    const accountType =
  dto.accountType ??
  typeForLetter((subHead.code ?? subHead.headAccount.code ?? '').charAt(0));

    const item = await this.prisma.mainAccount.create({
      data: {
        code: dto.code,
        name: dto.name,
        subHeadId: dto.subHeadId,
        accountType,
        description: dto.description ?? null,
        openingBalance: dto.openingBalance ?? 0,
        openingBalanceType: dto.openingBalanceType ?? 'DR',
        status: dto.status ?? 'active',
      },
      include: { subHead: { include: { headAccount: true } } },
    });

    if (Number(dto.openingBalance ?? 0) !== 0) {
      await this.accounting.syncOpeningVoucher(item.id, actorId);
    }

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
    const current = await this.ensureExists(id);
    if (dto.subHeadId) {
      const subHead = await this.prisma.subHead.findUnique({ where: { id: dto.subHeadId } });
      if (!subHead) throw ApiException.notFound('Sub head');
    }

    const data: Record<string, unknown> = { ...dto };
    const openingChanged = dto.openingBalance !== undefined
      ? Number(dto.openingBalance) !== Number(current.openingBalance)
      : false;
    const typeChanged =
      dto.openingBalanceType !== undefined &&
      dto.openingBalanceType !== current.openingBalanceType;

    const item = await this.prisma.mainAccount.update({ where: { id }, data });
    this.audit.record({
      userId: actorId, action: 'UPDATE', module: 'MAIN_ACCOUNT', entity: 'MainAccount',
      entityId: id, message: `Main account ${item.name} updated`,
    });

    const balanceAfter = Number(item.openingBalance ?? 0);
    if (openingChanged || typeChanged || balanceAfter !== 0) {
      await this.accounting.syncOpeningVoucher(id, actorId);
    }

    return item;
  }

  async remove(id: string, actorId?: string) {
    const item = await this.ensureExists(id);
    const [entryCount, customers, suppliers] = await Promise.all([
      this.prisma.voucherEntry.count({ where: { mainAccountId: id } }),
      this.prisma.customer.count({ where: { mainAccountId: id } }),
      this.prisma.supplier.count({ where: { mainAccountId: id } }),
    ]);
    const references: string[] = [];
    if (entryCount > 0) references.push(`${entryCount} voucher entr${entryCount === 1 ? 'y' : 'ies'}`);
    if (customers > 0) references.push(`${customers} linked customer${customers === 1 ? '' : 's'}`);
    if (suppliers > 0) references.push(`${suppliers} linked supplier${suppliers === 1 ? '' : 's'}`);
    if (references.length > 0) {
      throw ApiException.deleteBlocked(`Main account "${item.name}"`, references);
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

const LETTER_TO_TYPE: Record<string, string> = {
  A: 'ASSET',
  L: 'LIABILITY',
  E: 'EXPENSE',
  R: 'REVENUE',
  P: 'EQUITY',
};

function typeForLetter(letter: string): string {
  return LETTER_TO_TYPE[letter.toUpperCase()] ?? 'ASSET';
}