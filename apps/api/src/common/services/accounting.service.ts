import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
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
  constructor(private readonly prisma: PrismaService) {}

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
      data: { status: 'posted' },
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
   */
  async accountBalance(mainAccountId: string, asOf?: Date): Promise<number> {
    const account = await this.prisma.mainAccount.findUnique({
      where: { id: mainAccountId },
    });
    if (!account) throw ApiException.notFound('Account');

    let balance = Number(account.openingBalance ?? 0);

    const where: any = { mainAccountId, voucher: { status: 'posted' } };
    if (asOf) where.voucher.voucherDate = { lte: asOf };

    const agg = await this.prisma.voucherEntry.aggregate({
      where,
      _sum: { debit: true, credit: true },
    });
    balance += Number(agg._sum.debit ?? 0) - Number(agg._sum.credit ?? 0);
    return round2(balance);
  }
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}