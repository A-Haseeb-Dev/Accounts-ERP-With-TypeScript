import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ApiException } from '../common/exceptions/api.exception';

@Injectable()
export class AccountingReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /** General Ledger - account movements with running balance. */
  async generalLedger(query: { accountId: string; from?: string; to?: string; page?: number; pageSize?: number }) {
    const { accountId, from, to, page = 1, pageSize = 100 } = query;
    const account = await this.prisma.mainAccount.findUnique({
      where: { id: accountId },
      include: { subHead: { include: { headAccount: true } } },
    });
    if (!account) throw ApiException.notFound('Account');

    const voucherWhere: any = { status: 'posted' };
    if (from || to) {
      voucherWhere.voucherDate = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      };
    }

    const entries = await this.prisma.voucherEntry.findMany({
      where: { mainAccountId: accountId, voucher: voucherWhere },
      include: { voucher: true },
      orderBy: [{ voucher: { voucherDate: 'asc' } }, { id: 'asc' }],
    });

    // Opening balance = account opening balance + all posted entries before 'from'.
    let openingBalance = Number(account.openingBalance ?? 0);
    if (from) {
      const before = await this.prisma.voucherEntry.aggregate({
        where: {
          mainAccountId: accountId,
          voucher: { status: 'posted', voucherDate: { lt: new Date(from) } },
        },
        _sum: { debit: true, credit: true },
      });
      openingBalance += Number(before._sum.debit ?? 0) - Number(before._sum.credit ?? 0);
    }

    let running = openingBalance;
    const rows = entries.map((e) => {
      running += Number(e.debit) - Number(e.credit);
      return {
        date: e.voucher.voucherDate,
        voucherNumber: e.voucher.number,
        voucherType: e.voucher.voucherType,
        description: e.voucher.description,
        debit: Number(e.debit),
        credit: Number(e.credit),
        balance: round2(running),
      };
    });

    const total = rows.length;
    const paginated = rows.slice((page - 1) * pageSize, page * pageSize);

    return {
      account,
      openingBalance: round2(openingBalance),
      closingBalance: round2(running),
      total,
      page,
      pageSize,
      rows: paginated,
    };
  }

  /** General Journal - all posted vouchers in date order. */
  async generalJournal(query: { from?: string; to?: string; page?: number; pageSize?: number }) {
    const { from, to, page = 1, pageSize = 100 } = query;
    const where: any = { status: 'posted' };
    if (from || to) {
      where.voucherDate = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      };
    }

    const total = await this.prisma.voucher.count({ where });
    const vouchers = await this.prisma.voucher.findMany({
      where,
      include: {
        entries: { include: { mainAccount: true } },
      },
      orderBy: [{ voucherDate: 'asc' }, { number: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    return {
      total,
      page,
      pageSize,
      vouchers: vouchers.map((v) => ({
        id: v.id,
        number: v.number,
        voucherType: v.voucherType,
        voucherDate: v.voucherDate,
        description: v.description,
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

  /** Trial balance - balances of all main accounts. */
  async trialBalance(query: { asOf?: string }) {
    const { asOf } = query;
    const accounts = await this.prisma.mainAccount.findMany({
      where: { status: 'active' },
      include: { subHead: { include: { headAccount: true } } },
      orderBy: { code: 'asc' },
    });

    const rows = [];
    let totalDebit = 0;
    let totalCredit = 0;

    for (const acc of accounts) {
      const voucherWhere: any = { status: 'posted' };
      if (asOf) voucherWhere.voucherDate = { lte: new Date(asOf) };
      const agg = await this.prisma.voucherEntry.aggregate({
        where: { mainAccountId: acc.id, voucher: voucherWhere },
        _sum: { debit: true, credit: true },
      });

      let balance = Number(acc.openingBalance ?? 0) + Number(agg._sum.debit ?? 0) - Number(agg._sum.credit ?? 0);
      balance = round2(balance);

      // Trial balance presentation: debit/credit split by current balance sign.
      let debit = 0;
      let credit = 0;
      if (balance > 0) debit = balance;
      else if (balance < 0) credit = Math.abs(balance);

      totalDebit += debit;
      totalCredit += credit;
      rows.push({
        accountId: acc.id,
        code: acc.code,
        name: acc.name,
        accountType: acc.accountType,
        head: acc.subHead?.headAccount?.name ?? null,
        subHead: acc.subHead?.name ?? null,
        debit: round2(debit),
        credit: round2(credit),
        balance,
      });
    }

    return {
      rows,
      totalDebit: round2(totalDebit),
      totalCredit: round2(totalCredit),
      balanced: round2(totalDebit) === round2(totalCredit),
    };
  }

  /** Trial balance filtered by sub head. */
  async subHeadTrial(query: { subHeadId: string; asOf?: string }) {
    const { subHeadId, asOf } = query;
    const subHead = await this.prisma.subHead.findUnique({
      where: { id: subHeadId },
      include: { headAccount: true },
    });
    if (!subHead) throw ApiException.notFound('Sub head');

    const accounts = await this.prisma.mainAccount.findMany({
      where: { status: 'active', subHeadId },
      orderBy: { code: 'asc' },
    });

    const rows = [];
    let totalDebit = 0;
    let totalCredit = 0;
    for (const acc of accounts) {
      const voucherWhere: any = { status: 'posted' };
      if (asOf) voucherWhere.voucherDate = { lte: new Date(asOf) };
      const agg = await this.prisma.voucherEntry.aggregate({
        where: { mainAccountId: acc.id, voucher: voucherWhere },
        _sum: { debit: true, credit: true },
      });
      const balance = round2(Number(acc.openingBalance ?? 0) + Number(agg._sum.debit ?? 0) - Number(agg._sum.credit ?? 0));

      let debit = 0;
      let credit = 0;
      if (balance > 0) debit = balance;
      else if (balance < 0) credit = Math.abs(balance);
      totalDebit += debit;
      totalCredit += credit;
      rows.push({ accountId: acc.id, code: acc.code, name: acc.name, accountType: acc.accountType, debit: round2(debit), credit: round2(credit), balance });
    }

    return {
      subHead,
      rows,
      totalDebit: round2(totalDebit),
      totalCredit: round2(totalCredit),
      balanced: round2(totalDebit) === round2(totalCredit),
    };
  }

  /** Trial balance restricted to customer/supplier accounts of a town. */
  async townWiseTrial(query: { townId: string; asOf?: string }) {
    const { townId, asOf } = query;
    const town = await this.prisma.town.findUnique({ where: { id: townId } });
    if (!town) throw ApiException.notFound('Town');

    const customerAccounts = await this.prisma.mainAccount.findMany({
      where: { customers: { some: { townId } } },
    });
    const supplierAccounts = await this.prisma.mainAccount.findMany({
      where: { suppliers: { some: { townId } } },
    });
    const accountIds = [...new Set([...customerAccounts, ...supplierAccounts].map((a) => a.id))];

    const accounts = await this.prisma.mainAccount.findMany({
      where: { id: { in: accountIds } },
      include: { customers: true, suppliers: true },
      orderBy: { code: 'asc' },
    });

    const rows = [];
    let totalDebit = 0;
    let totalCredit = 0;
    for (const acc of accounts) {
      const voucherWhere: any = { status: 'posted' };
      if (asOf) voucherWhere.voucherDate = { lte: new Date(asOf) };
      const agg = await this.prisma.voucherEntry.aggregate({
        where: { mainAccountId: acc.id, voucher: voucherWhere },
        _sum: { debit: true, credit: true },
      });
      const balance = round2(Number(acc.openingBalance ?? 0) + Number(agg._sum.debit ?? 0) - Number(agg._sum.credit ?? 0));
      let debit = 0;
      let credit = 0;
      if (balance > 0) debit = balance;
      else if (balance < 0) credit = Math.abs(balance);
      totalDebit += debit;
      totalCredit += credit;
      rows.push({
        accountId: acc.id,
        code: acc.code,
        name: acc.name,
        party: acc.customers[0]
          ? `Customer: ${acc.customers[0].name}`
          : acc.suppliers[0]
            ? `Supplier: ${acc.suppliers[0].name}`
            : null,
        debit: round2(debit),
        credit: round2(credit),
        balance,
      });
    }

    return {
      town,
      rows,
      totalDebit: round2(totalDebit),
      totalCredit: round2(totalCredit),
      balanced: round2(totalDebit) === round2(totalCredit),
    };
  }

  /** Account list - chart of accounts. */
  async accountList() {
    const heads = await this.prisma.headAccount.findMany({
      include: {
        subHeads: {
          include: {
            mainAccounts: {
              orderBy: { code: 'asc' },
            },
          },
          orderBy: { code: 'asc' },
        },
      },
      orderBy: { code: 'asc' },
    });
    return heads;
  }
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}