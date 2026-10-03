import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { AccountingService } from '../../common/services/accounting.service';
import { ApiException } from '../../common/exceptions/api.exception';
import { AccountCodeService } from './account-code.service';
import { CreateMainAccountDto, UpdateMainAccountDto } from '../dto/accounts.dto';

@Injectable()
export class MainAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly accounting: AccountingService,
    private readonly codes: AccountCodeService,
  ) {}

  async create(dto: CreateMainAccountDto, actorId?: string) {
    const subHead = await this.prisma.subHead.findUnique({
      where: { id: dto.subHeadId },
      include: { headAccount: true },
    });
    if (!subHead) throw ApiException.notFound('Sub head');

    // The type follows the head the account is filed under, so an account can
    // never claim a type that contradicts the statement it is reported in.
    const accountType = this.codes.accountTypeForHeadCode(subHead.headAccount.code);

    const item = await this.prisma.$transaction(async (tx) => {
      const code = await this.codes.nextMainAccountCode(subHead.code, tx);
      return tx.mainAccount.create({
        data: {
          code,
          name: dto.name,
          subHeadId: dto.subHeadId,
          accountType,
          description: dto.description ?? null,
          openingBalance: dto.openingBalance ?? 0,
          openingBalanceType: dto.openingBalanceType ?? 'DR',
          openingDate: dto.openingDate ? new Date(dto.openingDate) : null,
          status: dto.status ?? 'active',
        },
        include: { subHead: { include: { headAccount: true } } },
      });
    });

    const syncWarning = await this.syncOpening(
      item.id,
      actorId,
      dto.openingBalance,
      item.openingDate,
    );

    this.audit.record({
      userId: actorId, action: 'CREATE', module: 'MAIN_ACCOUNT', entity: 'MainAccount',
      entityId: item.id, message: `Main account ${item.name} (${item.code}) created`,
      metadata: { accountType: item.accountType },
    });

    return syncWarning ? { ...item, warning: syncWarning } : item;
  }

  async previewCode(subHeadId: string) {
    const subHead = await this.prisma.subHead.findUnique({ where: { id: subHeadId } });
    if (!subHead) throw ApiException.notFound('Sub head');
    return this.codes.previewMainAccountCode(subHead.code);
  }

  /**
   * Posts the opening balance voucher when one is warranted and returns a
   * message to show the user if it could not be posted.
   *
   * The account itself is already committed by the time this runs, so a missing
   * equity account must not fail the request: it would leave the account
   * created but report failure. The balance is still carried by the stored
   * `openingBalance`, which reports read correctly, so the user is simply told
   * what to set up rather than being handed a database error.
   */
  private async syncOpening(
    accountId: string,
    actorId: string | undefined,
    openingBalance: unknown,
    openingDate?: Date | string | null,
  ): Promise<string | undefined> {
    if (Number(openingBalance ?? 0) === 0) return undefined;
    const result = await this.accounting.syncOpeningVoucher(accountId, actorId, openingDate ?? null);
    if (result.posted) return undefined;
    return 'Account saved, but its opening balance voucher was not posted because no Opening Equity account exists. Create an equity account (or map it in Settings > Accounting) and re-save this account to post the opening balance.';
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
    let target: { id: string; code: string; headCode: string } | null = null;
    if (dto.subHeadId) {
      const subHead = await this.prisma.subHead.findUnique({
        where: { id: dto.subHeadId },
        include: { headAccount: true },
      });
      if (!subHead) throw ApiException.notFound('Sub head');
      target = { id: subHead.id, code: subHead.code, headCode: subHead.headAccount.code };
    }

    // Moving an account to another sub head renumbers it, because its code
    // carries that sub head's. The type follows the new head so the account is
    // still reported on the statement it now belongs to.
    const moving = !!target && target.id !== current.subHeadId;

    const data: Record<string, unknown> = { ...dto };
    if (dto.openingDate !== undefined) data.openingDate = dto.openingDate ? new Date(dto.openingDate) : null;
    if (moving) {
      const code = await this.codes.nextMainAccountCode(target!.code);
      data.code = code;
      data.accountType = this.codes.accountTypeForHeadCode(target!.headCode);
    }

    const openingChanged = dto.openingBalance !== undefined
      ? Number(dto.openingBalance) !== Number(current.openingBalance)
      : false;
    const typeChanged =
      dto.openingBalanceType !== undefined &&
      dto.openingBalanceType !== current.openingBalanceType;
    const dateChanged =
      dto.openingDate !== undefined &&
      (dto.openingDate ? new Date(dto.openingDate).toDateString() : null) !==
        (current.openingDate ? new Date(current.openingDate).toDateString() : null);

    const item = await this.prisma.mainAccount.update({ where: { id }, data });
    this.audit.record({
      userId: actorId, action: 'UPDATE', module: 'MAIN_ACCOUNT', entity: 'MainAccount',
      entityId: id,
      message: moving
        ? `Main account ${item.name} moved to ${target!.code} and renumbered to ${item.code}`
        : `Main account ${item.name} updated`,
    });

    const balanceAfter = Number(item.openingBalance ?? 0);
    const syncWarning =
      openingChanged || typeChanged || dateChanged || balanceAfter !== 0
        ? await this.syncOpening(id, actorId, balanceAfter, item.openingDate)
        : undefined;

    return syncWarning ? { ...item, warning: syncWarning } : item;
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
