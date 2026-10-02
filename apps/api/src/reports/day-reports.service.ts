import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { startOfDay, endOfDay } from '../common/utils/date-filter';
import { orphanVoucherExclusions, createOrphanMemo, type OrphanMemo } from '../common/utils/orphan-records';

/**
 * Day Book and Day Summary.
 *
 * The general journal answers "what was posted between two dates" but a shop
 * owner also asks "how did today go" - sales made, money collected, money paid
 * out, and what the cash balance looks like at close of day. That is what this
 * report answers, for one specific date.
 *
 * Documents are read from their own tables rather than from vouchers, because
 * only they know who the counterparty was and whether the document was an
 * invoice or a receipt. The day book itself is voucher-based so that manual
 * journals appear alongside system postings.
 */
@Injectable()
export class DayReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Default to today when the caller sends no date. */
  private resolveDate(date?: string): string {
    return date?.trim() || new Date().toISOString().slice(0, 10);
  }

  async dayReport(query: { date?: string; page?: number; pageSize?: number }) {
    const { page = 1, pageSize = 100 } = query;
    const date = this.resolveDate(query.date);
    const from = startOfDay(date);
    const to = endOfDay(date);

    const summary = await this.daySummary({ date, from, to });

    const memo = createOrphanMemo();
    const voucherWhere = await this.postedVoucherFilter({ voucherDate: { gte: from, lte: to } }, memo);

    const total = await this.prisma.voucher.count({ where: voucherWhere });
    const vouchers = await this.prisma.voucher.findMany({
      where: voucherWhere,
      include: { entries: { include: { mainAccount: true } } },
      orderBy: [{ createdAt: 'asc' }, { number: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    return {
      date,
      summary,
      total,
      page,
      pageSize,
      vouchers: vouchers.map((v) => ({
        id: v.id,
        number: v.number,
        voucherType: v.voucherType,
        voucherDate: v.voucherDate,
        description: v.description,
        reference: v.reference,
        entries: v.entries.map((e) => ({
          accountCode: e.mainAccount.code,
          accountName: e.mainAccount.name,
          debit: Number(e.debit),
          credit: Number(e.credit),
          narration: e.narration,
        })),
        totalDebit: Number(v.totalDebit),
        totalCredit: Number(v.totalCredit),
      })),
    };
  }

  /**
   * Money and document counts for one day, plus the cash/bank position at
   * close of that day.
   */
  private async daySummary(args: { date: string; from: Date; to: Date }) {
    const { date, from, to } = args;

    const [sales, salesReturns, purchases, purchaseReturns, receipts, payments, expenses] =
      await Promise.all([
        this.prisma.sale.aggregate({
          where: { status: 'posted', saleDate: { gte: from, lte: to } },
          _count: { _all: true },
          _sum: { grandTotal: true },
        }),
        this.prisma.salesReturn.aggregate({
          where: { status: 'posted', returnDate: { gte: from, lte: to } },
          _count: { _all: true },
          _sum: { grandTotal: true },
        }),
        this.prisma.purchase.aggregate({
          where: { status: 'posted', purchaseDate: { gte: from, lte: to } },
          _count: { _all: true },
          _sum: { grandTotal: true },
        }),
        this.prisma.purchaseReturn.aggregate({
          where: { status: 'posted', returnDate: { gte: from, lte: to } },
          _count: { _all: true },
          _sum: { grandTotal: true },
        }),
        this.prisma.paymentEntry.aggregate({
          where: { status: 'posted', paymentType: 'RECEIPT', paymentDate: { gte: from, lte: to } },
          _count: { _all: true },
          _sum: { amount: true },
        }),
        this.prisma.paymentEntry.aggregate({
          where: { status: 'posted', paymentType: 'PAYMENT', paymentDate: { gte: from, lte: to } },
          _count: { _all: true },
          _sum: { amount: true },
        }),
        this.expenseTotal(from, to),
      ]);

    const cashAccount = await this.resolveCashAccount();
    let closingCash = 0;

    if (cashAccount) {
      // Same opening rule as the Cash Book, so both agree on what "cash in
      // hand" means: an opening voucher wins, otherwise the account's own
      // stored opening balance does.
      const obVoucher = await this.prisma.voucherEntry.aggregate({
        where: { mainAccountId: cashAccount.id, voucher: { status: 'posted', reference: { startsWith: 'OB:' } } },
        _sum: { debit: true, credit: true },
      });
      const fromVoucher = round2(num(obVoucher._sum.debit) - num(obVoucher._sum.credit));
      const opening =
        fromVoucher !== 0
          ? fromVoucher
          : cashAccount.openingBalanceType === 'CR'
            ? -num(cashAccount.openingBalance)
            : num(cashAccount.openingBalance);

      const closingRows = await this.prisma.voucherEntry.groupBy({
        by: ['mainAccountId'],
        where: {
          mainAccountId: cashAccount.id,
          voucher: await this.postedVoucherFilter({ voucherDate: { lte: to } }, createOrphanMemo()),
        },
        _sum: { debit: true, credit: true },
      });

      // Closing is the true position at the end of the day, not just the day's
      // movement - otherwise the figure would restart from zero every morning.
      const movement = closingRows.reduce(
        (acc, row) => acc + num(row._sum.debit) - num(row._sum.credit),
        0,
      );
      closingCash = round2(opening + movement);
    }

    const salesTotal = num(sales._sum.grandTotal);
    const salesReturnTotal = num(salesReturns._sum.grandTotal);
    const purchaseTotal = num(purchases._sum.grandTotal);
    const purchaseReturnTotal = num(purchaseReturns._sum.grandTotal);
    const receivedTotal = num(receipts._sum.amount);
    const paidTotal = num(payments._sum.amount);

    return {
      date,
      sales: { count: sales._count._all, total: salesTotal },
      salesReturns: { count: salesReturns._count._all, total: salesReturnTotal },
      purchases: { count: purchases._count._all, total: purchaseTotal },
      purchaseReturns: { count: purchaseReturns._count._all, total: purchaseReturnTotal },
      receipts: { count: receipts._count._all, total: receivedTotal },
      payments: { count: payments._count._all, total: paidTotal },
      expenses: expenses.total,
      // Net sales after returns - the number that actually reflects the day.
      netSales: round2(salesTotal - salesReturnTotal),
      netPurchases: round2(purchaseTotal - purchaseReturnTotal),
      cashIn: round2(receivedTotal),
      cashOut: round2(paidTotal + expenses.total),
      closingCash,
      cashAccount: cashAccount ? { code: cashAccount.code, name: cashAccount.name } : null,
    };
  }

  /** Total debits on expense accounts for the day. */
  private async expenseTotal(from: Date, to: Date) {
    const memo = createOrphanMemo();
    const agg = await this.prisma.voucherEntry.aggregate({
      where: {
        debit: { gt: 0 },
        mainAccount: { accountType: 'EXPENSE' },
        voucher: await this.postedVoucherFilter({ voucherDate: { gte: from, lte: to } }, memo),
      },
      _sum: { debit: true },
    });
    return { total: round2(num(agg._sum.debit)) };
  }

  /**
   * The single account mapped as Cash in Settings.
   *
   * No fallback to "the first asset account": every company lays out its own
   * chart, so guessing could report receivables as cash. When nothing is
   * mapped the closing line is simply unavailable rather than wrong.
   */
  private async resolveCashAccount() {
    const setting = await this.prisma.systemSetting.findFirst({
      where: { key: 'accounting.cash_account' },
      select: { value: true },
    });
    if (!setting?.value) return null;
    return this.prisma.mainAccount.findUnique({
      where: { id: setting.value },
      select: { id: true, code: true, name: true, openingBalance: true, openingBalanceType: true },
    });
  }

  /**
   * Posted vouchers, minus any whose source document has since been deleted.
   * `reference: null` is kept: that is a hand-written journal, not an orphan.
   */
  private async postedVoucherFilter(
    extra: Record<string, unknown> = {},
    memo?: OrphanMemo,
  ): Promise<Record<string, unknown>> {
    const exclusions = await orphanVoucherExclusions(this.prisma, memo);
    return {
      status: 'posted',
      ...extra,
      OR: [{ reference: null }, { AND: [{ NOT: [{ reference: { startsWith: 'OB:' } }] }, ...exclusions] }],
    };
  }
}

function num(v: unknown): number {
  return Number(v ?? 0);
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
