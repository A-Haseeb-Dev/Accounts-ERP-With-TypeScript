import { describe, it, expect, vi } from 'vitest';
import { AccountingReportsService } from './accounting-reports.service';

/**
 * The expense report is read off posted voucher entries rather than any
 * document total, which is what makes it reconcile with the trial balance. So
 * the tests mostly guard the query shape and the debit-minus-credit netting.
 */

function buildService(mainAccounts: unknown[], grouped: unknown[] = []) {
  const prisma = {
    mainAccount: { findMany: vi.fn().mockResolvedValue(mainAccounts) },
    systemSetting: { findMany: vi.fn().mockResolvedValue([]) },
    $queryRawUnsafe: vi.fn().mockResolvedValue([]),
    voucherEntry: { groupBy: vi.fn().mockResolvedValue(grouped) },
  };
  return { svc: new AccountingReportsService(prisma as never), prisma };
}

const expenseAccount = (over: Record<string, unknown> = {}) => ({
  id: 'rent',
  code: '05-01',
  name: 'Rent Expense',
  accountType: 'EXPENSE',
  status: 'active',
  subHeadId: 'sh-exp',
  subHead: { id: 'sh-exp', name: 'Operating Expenses', headAccount: { name: 'Expenses' } },
  ...over,
});

const assetAccount = {
  id: 'cash',
  code: '01-01',
  name: 'Cash',
  accountType: 'ASSET',
  status: 'active',
  subHeadId: 'sh-ca',
  subHead: { id: 'sh-ca', name: 'Current Assets', headAccount: { name: 'Assets' } },
};

describe('expenseReport', () => {
  it('reads posted voucher entries and asks only for expense accounts', async () => {
    const { svc, prisma } = buildService([expenseAccount(), assetAccount]);

    await svc.expenseReport({ from: '2026-09-01', to: '2026-09-30' });

    expect(prisma.mainAccount.findMany.mock.calls[0][0].where).toMatchObject({
      accountType: 'EXPENSE',
      status: 'active',
    });

    const groupArgs = prisma.voucherEntry.groupBy.mock.calls[0][0];
    expect(groupArgs.where.debit).toEqual({ gt: 0 });
    // Only the expense account id is grouped, so an asset account can never
    // creep into the total.
    expect(groupArgs.where.mainAccountId).toEqual({ in: ['rent'] });
    expect(groupArgs.where.voucher.status).toBe('posted');
  });

  it('narrows the date window when one is given', async () => {
    const { svc, prisma } = buildService([expenseAccount()]);
    await svc.expenseReport({ from: '2026-09-01', to: '2026-09-30' });

    const where = prisma.voucherEntry.groupBy.mock.calls[0][0].where.voucher;
    expect(where.voucherDate.gte.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(where.voucherDate.lte.toISOString()).toBe('2026-09-30T23:59:59.999Z');
  });

  it('nets credits off an expense that was reversed', async () => {
    const { svc } = buildService([expenseAccount()], [
      { mainAccountId: 'rent', _sum: { debit: 1200, credit: 200 } },
    ]);

    const result = await svc.expenseReport({});

    expect(result.rows[0]).toMatchObject({ code: '05-01', debit: 1200, credit: 200, net: 1000 });
    expect(result.total).toBe(1000);
  });

  it('carries the sub-head and head names through for grouping on screen', async () => {
    const { svc } = buildService([expenseAccount()], [{ mainAccountId: 'rent', _sum: { debit: 500, credit: 0 } }]);
    const result = await svc.expenseReport({});

    expect(result.rows[0].subHeadName).toBe('Operating Expenses');
    expect(result.rows[0].headName).toBe('Expenses');
  });

  it('drops an expense account with no movement so the table stays short', async () => {
    const { svc } = buildService([expenseAccount(), expenseAccount({ id: 'util', code: '05-02', name: 'Utilities' })], [
      { mainAccountId: 'rent', _sum: { debit: 500, credit: 0 } },
    ]);

    const result = await svc.expenseReport({});
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].code).toBe('05-01');
  });

  it('filters by sub-head when one is chosen', async () => {
    const { svc, prisma } = buildService([expenseAccount()]);
    await svc.expenseReport({ subHeadId: 'sh-exp' });
    expect(prisma.mainAccount.findMany.mock.calls[0][0].where.subHeadId).toBe('sh-exp');
  });

  it('returns an empty total when nothing was posted', async () => {
    const { svc } = buildService([expenseAccount()]);
    const result = await svc.expenseReport({});
    expect(result.rows).toEqual([]);
    expect(result.total).toBe(0);
  });
});
