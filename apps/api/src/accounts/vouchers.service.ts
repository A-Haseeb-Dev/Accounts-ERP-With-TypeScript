import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NumberingService } from '../common/services/numbering.service';
import { AccountingService } from '../common/services/accounting.service';
import { DefaultAccountsService } from '../common/services/default-accounts.service';
import { FiscalPeriodGuard } from '../common/services/fiscal-period.guard';
import { ApiException } from '../common/exceptions/api.exception';
import { CreateVoucherDto } from './dto/vouchers.dto';
import { dateRange } from '../common/utils/date-filter';

const TYPE_PREFIX: Record<string, string> = {
  JOURNAL: 'JV',
  CREDIT: 'CV',
  DEBIT: 'DV',
};

@Injectable()
export class VouchersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly numbering: NumberingService,
    private readonly accounting: AccountingService,
    private readonly defaultAccounts: DefaultAccountsService,
    private readonly fiscal: FiscalPeriodGuard,
  ) {}

  previewNumber(voucherType?: string) {
    const type = (voucherType ?? 'JOURNAL').toUpperCase();
    return this.numbering.preview(
      `voucher_${type.toLowerCase()}`,
      TYPE_PREFIX[type] ?? 'JV',
    );
  }

  async create(dto: CreateVoucherDto, actorId?: string) {
    if (!dto.entries.some((e) => Number(e.debit ?? 0) > 0)) {
      throw ApiException.validation('A debit entry is required');
    }
    if (!dto.entries.some((e) => Number(e.credit ?? 0) > 0)) {
      throw ApiException.validation('A credit entry is required');
    }
    // Pre-validate balance before opening a transaction.
    this.accounting.assertBalanced(dto.entries);
    await this.fiscal.assertOpen(dto.voucherDate, 'Cannot create a voucher');

    const number = await this.numbering.next(
      `voucher_${dto.voucherType.toLowerCase()}`,
      TYPE_PREFIX[dto.voucherType],
    );

    try {
      const voucher = await this.prisma.runInTransaction(async (tx) => {
        const created = await this.accounting.createVoucher(
          tx,
          {
            voucherType: dto.voucherType,
            voucherDate: new Date(dto.voucherDate),
            description: dto.description,
            reference: dto.reference,
            entries: dto.entries,
            createdById: actorId,
          },
          number,
        );
        this.audit.record({
          userId: actorId,
          action: 'CREATE',
          module: 'VOUCHER',
          entity: 'Voucher',
          entityId: created.id,
          message: `${dto.voucherType} voucher ${number} created (net ${created.totalDebit})`,
        });
        return created;
      });
      return voucher;
    } catch (err) {
      if ((err as Error).message?.startsWith('ERR_UNBALANCED')) throw err;
      throw err;
    }
  }

  async post(id: string, actorId?: string) {
    const voucher = await this.prisma.voucher.findUnique({ where: { id } });
    if (!voucher) throw ApiException.notFound('Voucher');
    await this.fiscal.assertOpen(voucher.voucherDate, 'Cannot post a voucher');

    const posted = await this.prisma.runInTransaction(async (tx) => {
      const result = await this.accounting.postVoucher(tx, id, actorId);
      this.audit.record({
        userId: actorId,
        action: 'POST',
        module: 'VOUCHER',
        entity: 'Voucher',
        entityId: id,
        message: `${voucher.voucherType} voucher ${voucher.number} posted`,
      });
      return result;
    });
    return posted;
  }

  async unpost(id: string, actorId?: string) {
    const voucher = await this.prisma.voucher.findUnique({ where: { id } });
    if (!voucher) throw ApiException.notFound('Voucher');
    if (voucher.status !== 'posted') {
      throw ApiException.invalidTransaction(
        `Only posted vouchers can be unposted. "${voucher.number}" is ${voucher.status}.`,
      );
    }
    if (voucher.reference?.startsWith('OB:')) {
      throw ApiException.invalidTransaction(
        'Opening balance vouchers cannot be unposted manually.',
      );
    }
    await this.fiscal.assertOpen(voucher.voucherDate, 'Cannot unpost a voucher');

    const unposted = await this.prisma.voucher.update({
      where: { id },
      data: { status: 'draft', postedById: null, postedAt: null },
    });
    this.audit.record({
      userId: actorId,
      action: 'UNPOST',
      module: 'VOUCHER',
      entity: 'Voucher',
      entityId: id,
      message: `${voucher.voucherType} voucher ${voucher.number} unposted back to draft`,
    });
    return unposted;
  }

  async submit(id: string, actorId?: string) {
    const voucher = await this.prisma.voucher.findUnique({ where: { id } });
    if (!voucher) throw ApiException.notFound('Voucher');
    if (voucher.status === 'posted' || voucher.status === 'cancelled') {
      throw ApiException.invalidTransaction(
        `A ${voucher.status} voucher cannot be submitted for approval`,
      );
    }
    if (voucher.status === 'pending') return voucher;

    return this.prisma.voucher.update({
      where: { id },
      data: { status: 'pending', submittedById: actorId ?? null, submittedAt: new Date() },
    });
  }

  async reject(id: string, reason: string, actorId?: string) {
    const voucher = await this.prisma.voucher.findUnique({ where: { id } });
    if (!voucher) throw ApiException.notFound('Voucher');
    if (voucher.status !== 'pending') {
      throw ApiException.invalidTransaction(
        `Only pending vouchers can be rejected. "${voucher.number}" is ${voucher.status}.`,
      );
    }

    const rejected = await this.prisma.voucher.update({
      where: { id },
      data: {
        status: 'draft',
        rejectedById: actorId ?? null,
        rejectedAt: new Date(),
        rejectReason: reason ?? 'Rejected',
      },
    });
    this.audit.record({
      userId: actorId,
      action: 'REJECT',
      module: 'VOUCHER',
      entity: 'Voucher',
      entityId: id,
      message: `${voucher.voucherType} voucher ${voucher.number} rejected`,
      metadata: { reason },
    });
    return rejected;
  }

  async cancel(id: string, reason: string, actorId?: string) {
    const voucher = await this.prisma.voucher.findUnique({ where: { id } });
    if (!voucher) throw ApiException.notFound('Voucher');
    await this.fiscal.assertOpen(voucher.voucherDate, 'Cannot cancel a voucher');

    const cancelled = await this.prisma.runInTransaction(async (tx) => {
      const result = await this.accounting.cancelVoucher(tx, id, reason, actorId);
      this.audit.record({
        userId: actorId,
        action: 'CANCEL',
        module: 'VOUCHER',
        entity: 'Voucher',
        entityId: id,
        message: `${voucher.voucherType} voucher ${voucher.number} cancelled`,
        metadata: { reason },
      });
      return result;
    });
    return cancelled;
  }

  async findAll(query: {
    page?: number; pageSize?: number; search?: string; status?: string;
    voucherType?: string; from?: string; to?: string;
  }) {
    const { page = 1, pageSize = 25, search, status, voucherType, from, to } = query;
    const where: Record<string, unknown> = {};
    if (search) {
      where.OR = [
        { number: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { reference: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (status) where.status = status;
    if (voucherType) where.voucherType = voucherType;
    if (from || to) {
      where.voucherDate = dateRange(from, to);
    }

    const [items, total] = await Promise.all([
      this.prisma.voucher.findMany({
        where,
        include: { createdBy: { select: { id: true, fullName: true, username: true } }, entries: { include: { mainAccount: true } } },
        orderBy: { voucherDate: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.voucher.count({ where }),
    ]);

    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async cashBook(query: { page?: number; pageSize?: number; accountId?: string; from?: string; to?: string; search?: string }) {
    const { page = 1, pageSize = 25, accountId, from, to, search } = query;
    // Never fall through to an unfiltered query: without an account filter this
    // would list every posted voucher entry in the ledger, not a cash book.
    const cashAccountId =
      accountId ?? (await this.defaultAccounts.resolveAccount('accounting.cash_account', 'Cash Account'));
    if (!cashAccountId) {
      throw ApiException.notFound('Cash account - set one in Settings > Accounting');
    }

    // The account's own opening (posted OB voucher, else the legacy column)
    // plus every posted movement dated before `from`, so the running balance
    // is correct when the book is filtered to a period.
    const openingFromPrevious = await this.cashOpening(cashAccountId, from);

    const baseVoucherWhere: Record<string, unknown> = {
      status: 'posted',
      NOT: { reference: { startsWith: 'OB:' } },
    };
    if (from || to) {
      baseVoucherWhere.voucherDate = dateRange(from, to);
    }

    const where: Record<string, unknown> = {
      mainAccountId: cashAccountId,
      voucher: baseVoucherWhere,
    };
    if (search) {
      where.OR = [
        { voucher: { number: { contains: search, mode: 'insensitive' } } },
        { voucher: { description: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const entries = await this.prisma.voucherEntry.findMany({
      where,
      include: { voucher: { include: { createdBy: { select: { id: true, fullName: true } } } } },
      orderBy: { voucher: { voucherDate: 'asc' } },
    });
    const total = entries.length;

    let running = openingFromPrevious;
    const enriched = entries.map((e) => {
      running = round2(running + Number(e.debit) - Number(e.credit));
      return { ...e, runningBalance: running };
    });

    const paginated = enriched.slice((page - 1) * pageSize, page * pageSize);

    return {
      items: paginated,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      totalRunning: running,
      openingBalance: openingFromPrevious,
    };
  }

  /** Opening position of the cash account, including any pre-`from` movements. */
  private async cashOpening(mainAccountId: string | null | undefined, from?: string): Promise<number> {
    if (!mainAccountId) return 0;

    const beforeWhere = {
      status: 'posted',
      NOT: { reference: { startsWith: 'OB:' } },
      ...(from ? { voucherDate: { lt: new Date(`${from}T00:00:00.000Z`) } } : {}),
    };

    const before = await this.prisma.voucherEntry.aggregate({
      where: { mainAccountId, voucher: beforeWhere },
      _sum: { debit: true, credit: true },
    });
    const movements = round2(Number(before._sum.debit ?? 0) - Number(before._sum.credit ?? 0));

    const ob = await this.prisma.voucherEntry.aggregate({
      where: {
        mainAccountId,
        voucher: { status: 'posted', reference: { startsWith: 'OB:' } },
      },
      _sum: { debit: true, credit: true },
    });
    const fromVoucher = round2(Number(ob._sum.debit ?? 0) - Number(ob._sum.credit ?? 0));
    if (fromVoucher !== 0) return round2(fromVoucher + movements);

    const account = await this.prisma.mainAccount.findUnique({ where: { id: mainAccountId } });
    const legacy =
      account?.openingBalanceType === 'CR' ? -Number(account?.openingBalance ?? 0) : Number(account?.openingBalance ?? 0);
    return round2(legacy + movements);
  }

  async findOne(id: string) {
    const voucher = await this.prisma.voucher.findUnique({
      where: { id },
      include: {
        entries: { include: { mainAccount: { include: { subHead: { include: { headAccount: true } } } } } },
        createdBy: { select: { id: true, fullName: true, username: true } },
      },
    });
    if (!voucher) throw ApiException.notFound('Voucher');
    return voucher;
  }

  async update(id: string, dto: CreateVoucherDto, actorId?: string) {
    const voucher = await this.prisma.voucher.findUnique({ where: { id, entries: { some: {} } }, include: { entries: true } });
    if (!voucher) throw ApiException.notFound('Voucher');
    if (voucher.status === 'posted' || voucher.status === 'cancelled') {
      throw ApiException.invalidTransaction(
        `Only draft or pending vouchers can be edited. "${voucher.number}" is ${voucher.status} — unpost it first.`,
      );
    }

    if (!dto.entries.some((e) => Number(e.debit ?? 0) > 0)) {
      throw ApiException.validation('A debit entry is required');
    }
    if (!dto.entries.some((e) => Number(e.credit ?? 0) > 0)) {
      throw ApiException.validation('A credit entry is required');
    }
    this.accounting.assertBalanced(dto.entries);
    await this.fiscal.assertOpen(dto.voucherDate, 'Cannot update a voucher');

    const totalDebit = round2(dto.entries.reduce((s, e) => s + Number(e.debit ?? 0), 0));
    const totalCredit = round2(dto.entries.reduce((s, e) => s + Number(e.credit ?? 0), 0));

    const wasPending = voucher.status === 'pending';

    const updated = await this.prisma.runInTransaction(async (tx) => {
      await tx.voucherEntry.deleteMany({ where: { voucherId: id } });
      return tx.voucher.update({
        where: { id },
        data: {
          voucherDate: new Date(dto.voucherDate),
          description: dto.description ?? null,
          reference: dto.reference ?? null,
          totalDebit,
          totalCredit,
          // Editing a pending voucher (or a rejected one) drops it back to draft
          // so the user can review, resubmit and get it approved again.
          status: wasPending ? 'draft' : undefined,
          submittedById: wasPending ? null : undefined,
          submittedAt: wasPending ? null : undefined,
          rejectedById: null,
          rejectedAt: null,
          rejectReason: null,
          entries: {
            create: dto.entries.map((e) => ({
              mainAccountId: e.mainAccountId,
              debit: Number(e.debit ?? 0),
              credit: Number(e.credit ?? 0),
              narration: e.narration ?? null,
            })),
          },
        },
        include: { entries: true },
      });
    });
    this.audit.record({
      userId: actorId,
      action: 'UPDATE',
      module: 'VOUCHER',
      entity: 'Voucher',
      entityId: id,
      message: `${voucher.voucherType} voucher ${voucher.number} updated`,
    });
    return updated;
  }

  async remove(id: string, actorId?: string) {
    const voucher = await this.prisma.voucher.findUnique({ where: { id } });
    if (!voucher) throw ApiException.notFound('Voucher');
    if (voucher.status !== 'draft') {
      throw ApiException.invalidTransaction(`Only draft vouchers can be deleted. "${voucher.number}" is ${voucher.status}.`);
    }
    await this.fiscal.assertOpen(voucher.voucherDate, 'Cannot delete a voucher');

    await this.prisma.runInTransaction(async (tx) => {
      await tx.voucherEntry.deleteMany({ where: { voucherId: id } });
      await tx.voucher.delete({ where: { id } });
    });

    this.audit.record({
      userId: actorId,
      action: 'DELETE',
      module: 'VOUCHER',
      entity: 'Voucher',
      entityId: id,
      message: `${voucher.voucherType} voucher ${voucher.number} deleted`,
    });
    return { id, deleted: true };
  }
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}