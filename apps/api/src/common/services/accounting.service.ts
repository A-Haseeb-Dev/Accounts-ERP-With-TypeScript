import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NumberingService } from './numbering.service';
import { ApiException } from '../exceptions/api.exception';

export interface VoucherEntryInput {
  mainAccountId: string;
  debit?: number;
  credit?: number;
  narration?: string;
}

export interface CreateVoucherInput {
  voucherType: 'JOURNAL' | 'CREDIT' | 'DEBIT';
  voucherDate: Date;
  description?: string;
  reference?: string;
  entries: VoucherEntryInput[];
  createdById?: string | null;
}

export interface PostVoucherResult {
  voucherId: string;
  number: string;
  totalDebit: number;
  totalCredit: number;
}

/**
 * Accounting engine.
 *
 * Every financial transaction flows through here as a balanced set of
 * voucher entries. Debit total must equal credit total at all times.
 *
 * The service is designed to run inside a caller-provided transaction
 * client so that inventory + accounting + document creation are atomic.
 */
@Injectable()
export class AccountingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: NumberingService,
  ) {}

  /**
   * Validates a set of entries and, if balanced, creates + returns
   * the draft voucher header (without posting).
   */
  async createVoucher(
    tx: any,
    input: CreateVoucherInput,
    number: string,
  ): Promise<any> {
    this.assertBalanced(input.entries);

    const totalDebit = round2(
      input.entries.reduce((s, e) => s + Number(e.debit ?? 0), 0),
    );
    const totalCredit = round2(
      input.entries.reduce((s, e) => s + Number(e.credit ?? 0), 0),
    );

    const voucher = await tx.voucher.create({
      data: {
        number,
        voucherType: input.voucherType,
        voucherDate: input.voucherDate,
        description: input.description ?? null,
        reference: input.reference ?? null,
        status: 'draft',
        totalDebit,
        totalCredit,
        createdById: input.createdById ?? null,
        entries: {
          create: input.entries.map((e) => ({
            mainAccountId: e.mainAccountId,
            debit: Number(e.debit ?? 0),
            credit: Number(e.credit ?? 0),
            narration: e.narration ?? null,
          })),
        },
      },
      include: { entries: true },
    });

    return voucher;
  }

  /**
   * Marks a draft voucher as posted.
   */
  async postVoucher(tx: any, voucherId: string, postedById?: string): Promise<any> {
    const voucher = await tx.voucher.findUnique({
      where: { id: voucherId },
      include: { entries: true },
    });
    if (!voucher) throw ApiException.notFound('Voucher');
    if (voucher.status === 'posted') return voucher;
    if (voucher.status === 'cancelled') {
      throw ApiException.invalidTransaction('A cancelled voucher cannot be posted');
    }

    this.assertBalanced(voucher.entries);

    return tx.voucher.update({
      where: { id: voucherId },
      data: { status: 'posted', postedById: postedById ?? null, postedAt: new Date() },
      include: { entries: true },
    });
  }

  /**
   * Cancels a voucher. The original entries are preserved for audit
   * history; historical financial records are never hard-deleted.
   */
  async cancelVoucher(
    tx: any,
    voucherId: string,
    reason: string,
    cancelledById?: string,
  ): Promise<any> {
    const voucher = await tx.voucher.findUnique({ where: { id: voucherId } });
    if (!voucher) throw ApiException.notFound('Voucher');
    if (voucher.status === 'cancelled') return voucher;

    return tx.voucher.update({
      where: { id: voucherId },
      data: {
        status: 'cancelled',
        cancelReason: reason,
        cancelledAt: new Date(),
        cancelledBy: cancelledById ?? null,
      },
      include: { entries: true },
    });
  }

  assertBalanced(entries: VoucherEntryInput[]) {
    if (!entries || entries.length === 0) {
      throw ApiException.validation('A voucher must have at least one debit and one credit entry');
    }

    const totalDebit = round2(entries.reduce((s, e) => s + Number(e.debit ?? 0), 0));
    const totalCredit = round2(entries.reduce((s, e) => s + Number(e.credit ?? 0), 0));

    if (totalDebit !== totalCredit) {
      throw ApiException.unbalancedVoucher(totalDebit, totalCredit);
    }

    for (const e of entries) {
      const debit = Number(e.debit ?? 0);
      const credit = Number(e.credit ?? 0);
      if (debit < 0 || credit < 0) {
        throw ApiException.validation('Debit and credit amounts cannot be negative');
      }
      if (debit === 0 && credit === 0) {
        throw ApiException.validation('Each entry must have a debit or credit amount');
      }
    }
  }

  /**
   * Balance of an account as of a date (opening balance + posted entries).
   *
   * The opening position is taken from the account's posted opening-balance
   * voucher (reference `OB:<accountId>`) when one exists; legacy accounts that
   * predate opening vouchers fall back to the `openingBalance` column, honouring
   * the `openingBalanceType` DR/CR side.
   */
  async accountBalance(mainAccountId: string, asOf?: Date): Promise<number> {
    const account = await this.prisma.mainAccount.findUnique({
      where: { id: mainAccountId },
    });
    if (!account) throw ApiException.notFound('Account');

    let balance = 0;

    const obAgg = await this.prisma.voucherEntry.aggregate({
      where: {
        mainAccountId,
        voucher: { status: 'posted', reference: { startsWith: 'OB:' } },
      },
      _sum: { debit: true, credit: true },
    });
    const fromVoucher = round2(Number(obAgg._sum.debit ?? 0) - Number(obAgg._sum.credit ?? 0));
    if (fromVoucher !== 0) {
      balance += fromVoucher;
    } else {
      const legacy = Number(account.openingBalance ?? 0);
      balance += account.openingBalanceType === 'CR' ? -legacy : legacy;
    }

    const where: any = {
      mainAccountId,
      voucher: {
        status: 'posted',
        NOT: { reference: { startsWith: 'OB:' } },
      },
    };
    if (asOf) where.voucher.voucherDate = { lte: asOf };

    const agg = await this.prisma.voucherEntry.aggregate({
      where,
      _sum: { debit: true, credit: true },
    });
    balance += Number(agg._sum.debit ?? 0) - Number(agg._sum.credit ?? 0);
    return round2(balance);
  }

  /**
   * Creates (or updates) the posted "Opening Balance" voucher for an account.
   *
   * The voucher is a single balanced JOURNAL entry carrying `reference
   * "OB:<accountId>"`, with the account on its usual DR/CR side and the Opening
   * Equity account on the other. When the opening balance is zeroed the voucher
   * is removed; when the amount or side changes the old voucher is cancelled
   * (preserved for audit) and replaced.
   */
  async syncOpeningVoucher(accountId: string, actorId?: string, openingDate?: Date | string | null): Promise<void> {
    const account = await this.prisma.mainAccount.findUnique({
      where: { id: accountId },
    });
    if (!account) throw ApiException.notFound('Main account');

    const openingDay = openingDate ? new Date(openingDate) : account.createdAt;

    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.voucher.findFirst({
        where: { reference: `OB:${accountId}` },
        include: { entries: true },
      });

      const amount = round2(Number(account.openingBalance ?? 0));
      const isDr = (account.openingBalanceType ?? 'DR') === 'DR';

      const removeTrace = async (v: any) => {
        if (v.status === 'posted') {
          await this.cancelVoucher(tx, v.id, 'Opening balance adjusted', actorId);
        } else {
          await tx.voucherEntry.deleteMany({ where: { voucherId: v.id } });
          await tx.voucher.delete({ where: { id: v.id } });
        }
      };

      if (amount === 0) {
        if (existing) await removeTrace(existing);
        return;
      }

      const dateChanged =
        existing && openingDay
          ? existing.voucherDate.toDateString() !== openingDay.toDateString()
          : false;
      const unchanged =
        existing?.status === 'posted' &&
        !dateChanged &&
        existing.entries.some(
          (e) =>
            e.mainAccountId === accountId &&
            Number(isDr ? e.debit : e.credit) === amount,
        );
      if (unchanged) return;

      if (existing) await removeTrace(existing);

      const equityAccountId = await this.resolveOpeningEquityId();
      if (!equityAccountId) return;

      const number = await this.numbering.next('voucher_opening', 'OB', tx);
      const voucher = await this.createVoucher(
        tx,
        {
          voucherType: 'JOURNAL',
          voucherDate: openingDay,
          description: `Opening balance - ${account.name} (${account.code})`,
          reference: `OB:${accountId}`,
          entries: isDr
            ? [
                { mainAccountId: accountId, debit: amount, narration: 'Opening balance' },
                { mainAccountId: equityAccountId, credit: amount, narration: 'Opening balance' },
              ]
            : [
                { mainAccountId: accountId, credit: amount, narration: 'Opening balance' },
                { mainAccountId: equityAccountId, debit: amount, narration: 'Opening balance' },
              ],
          createdById: actorId,
        },
        number,
      );
      await this.postVoucher(tx, voucher.id, actorId);
      await tx.systemSetting.upsert({
        where: { key_organizationId: { key: 'accounting.opening_equity_account', organizationId: 'default-org' } },
        create: { key: 'accounting.opening_equity_account', value: equityAccountId, organizationId: 'default-org' },
        update: {},
      });
    });
  }

  private async resolveOpeningEquityId(): Promise<string | null> {
    const setting = await this.prisma.systemSetting.findFirst({
      where: { key: 'accounting.opening_equity_account' },
    });
    if (setting?.value) return setting.value;
    const byName = await this.prisma.mainAccount.findFirst({
      where: { name: 'Opening Equity', status: 'active' },
    });
    return byName?.id ?? null;
  }
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}