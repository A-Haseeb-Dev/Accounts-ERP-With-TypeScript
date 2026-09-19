import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ApiException } from '../common/exceptions/api.exception';

@Injectable()
export class AccountingReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Opening position of an account. Prefers the posted opening-balance voucher
   * (reference `OB:<accountId>`) when one exists; falls back to the legacy
   * `openingBalance` column, honouring the DR/CR side.
   */
  private async accountOpening(acc: {
    id: string;
    openingBalance?: number | unknown;
    openingBalanceType?: string | null;
  }): Promise<number> {
    const ob = await this.prisma.voucherEntry.aggregate({
      where: {
        mainAccountId: acc.id,
        voucher: { status: 'posted', reference: { startsWith: 'OB:' } },
      },
      _sum: { debit: true, credit: true },
    });
    const fromVoucher = round2(Number(ob._sum.debit ?? 0) - Number(ob._sum.credit ?? 0));
    if (fromVoucher !== 0) return fromVoucher;
    const legacy = Number(acc.openingBalance ?? 0);
    return acc.openingBalanceType === 'CR' ? -legacy : legacy;
  }

  /** General Ledger - account movements with running balance. */
  async generalLedger(query: { accountId: string; from?: string; to?: string; page?: number; pageSize?: number }) {
    const { accountId, from, to, page = 1, pageSize = 100 } = query;
    const account = await this.prisma.mainAccount.findUnique({
      where: { id: accountId },
      include: { subHead: { include: { headAccount: true } } },
    });
    if (!account) throw ApiException.notFound('Account');

    const voucherWhere: any = { status: 'posted', NOT: { reference: { startsWith: 'OB:' } } };
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

    // Opening balance = account opening + all posted entries before 'from'.
    let openingBalance = await this.accountOpening(account);
    if (from) {
      const before = await this.prisma.voucherEntry.aggregate({
        where: {
          mainAccountId: accountId,
          voucher: {
            status: 'posted',
            voucherDate: { lt: new Date(from) },
            NOT: { reference: { startsWith: 'OB:' } },
          },
        },
        _sum: { debit: true, credit: true },
      });
      openingBalance += Number(before._sum.debit ?? 0) - Number(before._sum.credit ?? 0);
    }

    let running = openingBalance;
    const rows = entries.map((e) => {
      running += Number(e.debit) - Number(e.credit);
      const bal = round2(running);
      return {
        id: e.id,
        date: e.voucher.voucherDate,
        voucherNumber: e.voucher.number,
        mainCode: account.code,
        mainAccount: account.name,
        voucherType: e.voucher.voucherType,
        description: e.voucher.description,
        debit: Number(e.debit),
        credit: Number(e.credit),
        balance: bal,
        balanceType: bal > 0 ? 'DR' : bal < 0 ? 'CR' : null,
      };
    });

    const total = rows.length;
    const paginated = rows.slice((page - 1) * pageSize, page * pageSize);
    const openingValue = round2(openingBalance);
    const closingValue = round2(running);

    return {
      account,
      openingBalance: openingValue,
      openingBalanceType: openingValue > 0 ? 'DR' : openingValue < 0 ? 'CR' : (account.openingBalanceType ?? 'DR'),
      closingBalance: closingValue,
      closingBalanceType: closingValue > 0 ? 'DR' : closingValue < 0 ? 'CR' : null,
      total,
      page,
      pageSize,
      rows: paginated,
    };
  }

  /** General Ledger summary - account balances grouped by sub-head (filterable by head / type / sub-head). */
  async generalLedgerSummary(query: { headId?: string; subHeadId?: string; accountType?: string; from?: string; to?: string }) {
    const { headId, subHeadId, accountType, from, to } = query;

    const accountWhere: any = { status: 'active' };
    if (headId) accountWhere.subHead = { headAccountId: headId };
    if (subHeadId) accountWhere.subHeadId = subHeadId;
    if (accountType) accountWhere.accountType = accountType;

    const accounts = await this.prisma.mainAccount.findMany({
      where: accountWhere,
      include: {
        subHead: { include: { headAccount: true } },
      },
      orderBy: [{ subHead: { code: 'asc' } }, { code: 'asc' }],
    });

    const voucherWhere: any = { status: 'posted', NOT: { reference: { startsWith: 'OB:' } } };
    if (from || to) {
      voucherWhere.voucherDate = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      };
    }

    const rows: any[] = [];
    let totalDebit = 0;
    let totalCredit = 0;
    let totalOpening = 0;

    for (const acc of accounts) {
      const agg = await this.prisma.voucherEntry.aggregate({
        where: { mainAccountId: acc.id, voucher: voucherWhere },
        _sum: { debit: true, credit: true },
      });
      let openingBalance = await this.accountOpening(acc);
      if (from) {
        const before = await this.prisma.voucherEntry.aggregate({
          where: {
            mainAccountId: acc.id,
            voucher: {
              status: 'posted',
              voucherDate: { lt: new Date(from) },
              NOT: { reference: { startsWith: 'OB:' } },
            },
          },
          _sum: { debit: true, credit: true },
        });
        openingBalance += Number(before._sum.debit ?? 0) - Number(before._sum.credit ?? 0);
      }
      const debit = round2(Number(agg._sum.debit ?? 0));
      const credit = round2(Number(agg._sum.credit ?? 0));
      const opening = round2(openingBalance);
      const closing = round2(opening + debit - credit);
      totalOpening += opening;
      totalDebit += debit;
      totalCredit += credit;

      rows.push({
        accountId: acc.id,
        code: acc.code,
        name: acc.name,
        accountType: acc.accountType,
        headId: acc.subHead?.headAccount.id ?? null,
        headName: acc.subHead?.headAccount.name ?? '—',
        subHeadId: acc.subHead?.id ?? null,
        subHeadName: acc.subHead?.name ?? '—',
        opening,
        debit,
        credit,
        closing,
        balanceType: closing > 0 ? 'DR' : closing < 0 ? 'CR' : null,
      });
    }

    const groupsMap = new Map<string, any>();
    for (const r of rows) {
      const key = r.subHeadName;
      if (!groupsMap.has(key)) {
        groupsMap.set(key, {
          subHeadId: r.subHeadId,
          subHeadName: r.subHeadName,
          headName: r.headName,
          headId: r.headId,
          rows: [],
          opening: 0,
          debit: 0,
          credit: 0,
          closing: 0,
        });
      }
      const g = groupsMap.get(key);
      g.rows.push(r);
      g.opening += r.opening;
      g.debit += r.debit;
      g.credit += r.credit;
      g.closing += r.closing;
    }

    const groups = [...groupsMap.values()].map((g) => ({
      ...g,
      opening: round2(g.opening),
      debit: round2(g.debit),
      credit: round2(g.credit),
      closing: round2(g.closing),
    }));

    return {
      groups,
      rows,
      totals: {
        opening: round2(totalOpening),
        debit: round2(totalDebit),
        credit: round2(totalCredit),
        closing: round2(totalOpening + totalDebit - totalCredit),
      },
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
      const voucherWhere: any = { status: 'posted', NOT: { reference: { startsWith: 'OB:' } } };
      if (asOf) voucherWhere.voucherDate = { lte: new Date(asOf) };
      const agg = await this.prisma.voucherEntry.aggregate({
        where: { mainAccountId: acc.id, voucher: voucherWhere },
        _sum: { debit: true, credit: true },
      });

      const opening = await this.accountOpening(acc);
      let balance = round2(opening + Number(agg._sum.debit ?? 0) - Number(agg._sum.credit ?? 0));

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
      const voucherWhere: any = { status: 'posted', NOT: { reference: { startsWith: 'OB:' } } };
      if (asOf) voucherWhere.voucherDate = { lte: new Date(asOf) };
      const agg = await this.prisma.voucherEntry.aggregate({
        where: { mainAccountId: acc.id, voucher: voucherWhere },
        _sum: { debit: true, credit: true },
      });
      const opening = await this.accountOpening(acc);
      const balance = round2(opening + Number(agg._sum.debit ?? 0) - Number(agg._sum.credit ?? 0));

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
      const voucherWhere: any = { status: 'posted', NOT: { reference: { startsWith: 'OB:' } } };
      if (asOf) voucherWhere.voucherDate = { lte: new Date(asOf) };
      const agg = await this.prisma.voucherEntry.aggregate({
        where: { mainAccountId: acc.id, voucher: voucherWhere },
        _sum: { debit: true, credit: true },
      });
      const opening = await this.accountOpening(acc);
      const balance = round2(opening + Number(agg._sum.debit ?? 0) - Number(agg._sum.credit ?? 0));
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