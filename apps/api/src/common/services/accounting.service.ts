import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NumberingService } from './numbering.service';
import { DefaultAccountsService } from './default-accounts.service';
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
    private readonly defaultAccounts: DefaultAccountsService,
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
    // Every entry is stored at the same 2dp the header totals are reported at.
    // Storing raw values while reporting rounded totals let a voucher print
    // 10.01 in the header while its rows summed to 10.005, so the trial balance
    // and the voucher itself disagreed by a paisa.
    const entries = this.normalizeEntries(input.entries);
    this.assertBalanced(entries);

    const totalDebit = round2(entries.reduce((s, e) => s + (e.debit ?? 0), 0));
    const totalCredit = round2(entries.reduce((s, e) => s + (e.credit ?? 0), 0));

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
          create: entries.map((e) => ({
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

  /** Rounds each entry's debit/credit to the stored precision. */
  private normalizeEntries(entries: VoucherEntryInput[]): VoucherEntryInput[] {
    return entries.map((e) => ({
      mainAccountId: e.mainAccountId,
      debit: round2(Number(e.debit ?? 0)),
      credit: round2(Number(e.credit ?? 0)),
      narration: e.narration,
    }));
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
    if (asOf) where.voucher.voucherDate = { lte: asOfInclusiveEnd(asOf) };

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
   *
   * When the company has no equity account to balance against there is nothing
   * to post, and that is a configuration gap rather than a failure - a fresh
   * chart legitimately has no equity account yet. This reports it instead of
   * throwing, so creating the account still succeeds. Reports stay correct
   * either way: `accountOpening` falls back to the stored `openingBalance` when
   * no opening voucher exists.
   */
  async syncOpeningVoucher(
    accountId: string,
    actorId?: string,
    openingDate?: Date | string | null,
  ): Promise<{ posted: boolean; reason?: string }> {
    const account = await this.prisma.mainAccount.findUnique({
      where: { id: accountId },
    });
    if (!account) throw ApiException.notFound('Main account');

    const openingDay = openingDate ? new Date(openingDate) : account.createdAt;

    // Resolve before opening the transaction so a missing equity account is
    // reported as a gap rather than failing half way through on a foreign key.
    const equityAccountId = await this.resolveOpeningEquityId(accountId, account.organizationId);

    const result = await this.prisma.$transaction(async (tx) => {
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
        return { posted: true } as const;
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
      if (unchanged) return { posted: true } as const;

      if (existing) await removeTrace(existing);

      if (!equityAccountId) return { posted: false, reason: 'NO_EQUITY_ACCOUNT' } as const;

      // Reserve a free number. The OB counter can be lagging behind rows that
      // predate sequential numbering (e.g. after a reseed/reset), which would
      // otherwise surface as "A record with the same value already exists:
      // number" on ANY subsequent edit of an account with an opening balance.
      // Retrying advances the atomic counter until a free number is found.
      let number: string | null = null;
      for (let attempt = 0; attempt < 32 && !number; attempt++) {
        const candidate = await this.numbering.next('voucher_opening', 'OB', tx);
        const clash = await tx.voucher.findUnique({ where: { number: candidate } });
        if (!clash) {
          number = candidate;
        }
      }
      if (!number) {
        throw ApiException.invalidTransaction(
          'Unable to allocate a unique opening balance voucher number.',
        );
      }

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
        where: {
          key_organizationId: {
            key: 'accounting.opening_equity_account',
            organizationId: account.organizationId,
          },
        },
        create: {
          key: 'accounting.opening_equity_account',
          value: equityAccountId,
          organizationId: account.organizationId,
        },
        update: {},
      });
      return { posted: true } as const;
    });

    return result;
  }

  /**
   * Resolves the account that absorbs the other side of an opening balance.
   *
   * The stored id is never trusted on its own. Companies delete and rebuild
   * their chart of accounts, so a configured id can outlive the row it points
   * at - and a dangling id turns every opening balance into a foreign key
   * failure at insert time. So the id is verified, a stale one is repaired,
   * and the account must genuinely be usable equity.
   *
   * `accountId` is excluded: an opening voucher that hit the same account on
   * both sides would balance on paper while meaning nothing.
   */
  private async resolveOpeningEquityId(accountId?: string, organizationId?: string): Promise<string | null> {
    const orgScope = organizationId ? { organizationId } : {};
    const usable = async (id: string | null | undefined) => {
      if (!id || id === accountId) return null;
      const acc = await this.prisma.mainAccount.findFirst({
        where: { id, ...orgScope },
        select: { id: true, accountType: true, status: true },
      });
      if (!acc || acc.status !== 'active') return null;
      // Opening balances only balance against equity. Anything else would let a
      // stock or asset account absorb them and quietly skew the balance sheet.
      return acc.accountType === 'EQUITY' ? acc.id : null;
    };

    const setting = await this.prisma.systemSetting.findFirst({
      where: { key: 'accounting.opening_equity_account', ...(organizationId ? { organizationId } : {}) },
      select: { id: true, value: true },
    });

    const fromSetting = await usable(setting?.value);
    if (fromSetting) return fromSetting;

    // Stale or unusable: clear it so the next lookup does not re-verify a dead
    // id, and do not silently accept a value that is not equity.
    if (setting?.value && !fromSetting) {
      await this.prisma.systemSetting
        .update({ where: { id: setting.id }, data: { value: null } })
        .catch(() => undefined);
    }

    const byName = await this.prisma.mainAccount.findFirst({
      where: { name: 'Opening Equity', status: 'active', ...orgScope },
      select: { id: true, accountType: true, status: true },
    });
    if (byName && byName.accountType === 'EQUITY' && byName.id !== accountId) return byName.id;

    // No configured account, but the chart may still hold usable equity.
    const anyEquity = await this.prisma.mainAccount.findFirst({
      where: {
        accountType: 'EQUITY',
        status: 'active',
        ...orgScope,
        ...(accountId ? { id: { not: accountId } } : {}),
      },
      select: { id: true },
      orderBy: { code: 'asc' },
    });
    return anyEquity?.id ?? null;
  }

  /**
   * Posts the ledger side of an item's opening stock: Dr Inventory, Cr Opening
   * Equity, dated at the opening date.
   *
   * Without this the stock reports and the trial balance disagree - goods are on
   * hand that no entry accounts for. It is the stock counterpart of
   * `syncOpeningVoucher`, with two differences worth stating. The reference is
   * `OBS:` rather than `OB:`, so it is a document movement and not an account
   * opening balance: `accountOpening` reads `OB:` vouchers as the opening
   * figure of an account, and an item's opening stock is not that. And it
   * reports rather than throws when the company has not bound an Inventory or
   * Opening Equity account, because a stock movement that has been recorded is
   * not something to refuse over a settings gap - the caller warns instead.
   */
  async syncOpeningStockVoucher(
    itemId: string,
    amount: number,
    actorId?: string,
    openingDate?: Date | string | null,
  ): Promise<{ posted: boolean; reason?: string }> {
    const value = round2(Number(amount ?? 0));

    // Read outside the transaction so the equity account is resolved for the
    // item's own company rather than whichever one happened to be configured.
    const item = await this.prisma.item.findUnique({
      where: { id: itemId },
      select: { code: true, name: true, organizationId: true },
    });

    const inventoryAccountId = await this.defaultAccounts.resolveAccount(
      'accounting.inventory_account',
    );
    const equityAccountId = await this.resolveOpeningEquityId(undefined, item?.organizationId);

    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.voucher.findFirst({
        where: { reference: `OBS:${itemId}` },
        include: { entries: true },
      });

      const removeTrace = async (v: any) => {
        if (v.status === 'posted') {
          await this.cancelVoucher(tx, v.id, 'Opening stock adjusted', actorId);
        } else {
          await tx.voucherEntry.deleteMany({ where: { voucherId: v.id } });
          await tx.voucher.delete({ where: { id: v.id } });
        }
      };

      if (value === 0) {
        if (existing) await removeTrace(existing);
        return { posted: true } as const;
      }

      const openingDay = openingDate ? new Date(openingDate) : new Date();
      const dateChanged =
        existing && openingDate
          ? existing.voucherDate.toDateString() !== openingDay.toDateString()
          : false;
      const unchanged =
        existing?.status === 'posted' &&
        !dateChanged &&
        existing.entries.some((e) => e.mainAccountId === inventoryAccountId && Number(e.debit) === value);
      if (unchanged) return { posted: true } as const;

      if (existing) await removeTrace(existing);

      if (!inventoryAccountId) return { posted: false, reason: 'NO_INVENTORY_ACCOUNT' } as const;
      if (!equityAccountId) return { posted: false, reason: 'NO_EQUITY_ACCOUNT' } as const;

      let number: string | null = null;
      for (let attempt = 0; attempt < 32 && !number; attempt++) {
        const candidate = await this.numbering.next('voucher_opening', 'OBS', tx);
        const clash = await tx.voucher.findUnique({ where: { number: candidate } });
        if (!clash) {
          number = candidate;
        }
      }
      if (!number) {
        throw ApiException.invalidTransaction(
          'Unable to allocate a unique opening stock voucher number.',
        );
      }

      const item_ = item ?? (await this.prisma.item.findUnique({
        where: { id: itemId },
        select: { code: true, name: true, organizationId: true },
      }));

      const voucher = await this.createVoucher(
        tx,
        {
          voucherType: 'JOURNAL',
          voucherDate: openingDay,
          description: `Opening stock - ${item_?.name ?? itemId}${item_?.code ? ` (${item_.code})` : ''}`,
          reference: `OBS:${itemId}`,
          entries: [
            { mainAccountId: inventoryAccountId, debit: value, narration: 'Opening stock' },
            { mainAccountId: equityAccountId, credit: value, narration: 'Opening stock' },
          ],
          createdById: actorId,
        },
        number,
      );
      await this.postVoucher(tx, voucher.id, actorId);
      return { posted: true } as const;
    });

    return result;
  }
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Widens an "as of" bound to the end of that day, but only when it looks like a
 * bare date. A caller passing `new Date('2026-10-05')` means midnight UTC, and
 * `lte` against that silently drops every entry later the same day - the exact
 * trap `common/utils/date-filter.ts` exists to avoid for the list endpoints.
 * A caller that passed a real timestamp keeps it, so "as of now" stays exact.
 */
function asOfInclusiveEnd(asOf: Date): Date {
  if (
    asOf.getUTCHours() === 0 &&
    asOf.getUTCMinutes() === 0 &&
    asOf.getUTCSeconds() === 0 &&
    asOf.getUTCMilliseconds() === 0
  ) {
    return new Date(
      Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate(), 23, 59, 59, 999),
    );
  }
  return asOf;
}