import { describe, it, expect, vi } from 'vitest';
import { AccountingReportsService } from './accounting-reports.service';

function buildService(mainAccounts: unknown[], aggregates: Record<string, { _sum: { debit: number; credit: number } }>) {
  const prisma = {
    mainAccount: { findMany: vi.fn().mockResolvedValue(mainAccounts) },
    voucherEntry: {
      aggregate: vi.fn(({ where }: { where: { mainAccountId: string; voucher?: unknown } }) =>
        Promise.resolve(aggregates[where.mainAccountId] ?? { _sum: { debit: 0, credit: 0 } }),
      ),
    },
  };
  const svc = new AccountingReportsService(prisma as never);
  return { svc, prisma };
}

describe('AccountingReportsService.trialBalance', () => {
  it('splits debit and credit by the current balance sign', async () => {
    const accounts = [
      {
        id: 'cash',
        code: '01-01',
        name: 'Cash Account',
        accountType: 'ASSET',
        openingBalance: 500000,
        status: 'active',
        subHead: { name: 'Current Assets', headAccount: { name: 'Assets' } },
      },
      {
        id: 'ap',
        code: '02-01',
        name: 'Accounts Payable',
        accountType: 'LIABILITY',
        openingBalance: 0,
        status: 'active',
        subHead: { name: 'Current Liabilities', headAccount: { name: 'Liabilities' } },
      },
      {
        id: 'rev',
        code: '04-01',
        name: 'Sales Revenue',
        accountType: 'REVENUE',
        openingBalance: 0,
        status: 'active',
        subHead: { name: 'Direct Revenue', headAccount: { name: 'Revenue' } },
      },
      {
        id: 'idle',
        code: '01-02',
        name: 'Bank Account',
        accountType: 'ASSET',
        openingBalance: 0,
        status: 'active',
        subHead: { name: 'Current Assets', headAccount: { name: 'Assets' } },
      },
    ];
    const aggregates = {
      cash: { _sum: { debit: 100000, credit: 0 } },
      ap: { _sum: { debit: 0, credit: 150000 } },
      rev: { _sum: { debit: 0, credit: 40000 } },
      idle: { _sum: { debit: 0, credit: 0 } },
    };

    const { svc } = buildService(accounts, aggregates);
    const result = await svc.trialBalance({});

    const byCode = Object.fromEntries(result.rows.map((r: { code: string }) => [r.code, r]));

    expect(byCode['01-01']).toMatchObject({ debit: 600000, credit: 0, balance: 600000 });
    expect(byCode['02-01']).toMatchObject({ debit: 0, credit: 150000, balance: -150000 });
    expect(byCode['04-01']).toMatchObject({ debit: 0, credit: 40000, balance: -40000 });
    expect(byCode['01-02']).toMatchObject({ debit: 0, credit: 0, balance: 0 });

    expect(result.totalDebit).toBe(600000);
    expect(result.totalCredit).toBe(190000);
    expect(result.balanced).toBe(false);
  });

  it('reports a balanced trial balance for fully offsetting entries', async () => {
    const accounts = [
      { id: 'cash', code: '01-01', name: 'Cash', accountType: 'ASSET', openingBalance: 0, status: 'active', subHead: { name: 's', headAccount: { name: 'h' } } },
      { id: 'lb', code: '02-01', name: 'Liability', accountType: 'LIABILITY', openingBalance: 0, status: 'active', subHead: { name: 's', headAccount: { name: 'h' } } },
    ];
    const aggregates = {
      cash: { _sum: { debit: 250, credit: 0 } },
      lb: { _sum: { debit: 0, credit: 250 } },
    };
    const { svc } = buildService(accounts, aggregates);
    const result = await svc.trialBalance({});
    expect(result.totalDebit).toBe(250);
    expect(result.totalCredit).toBe(250);
    expect(result.balanced).toBe(true);
  });

  it('honours an asOf date filter', async () => {
    const accounts = [
      { id: 'cash', code: '01-01', name: 'Cash', accountType: 'ASSET', openingBalance: 0, status: 'active', subHead: { name: 's', headAccount: { name: 'h' } } },
    ];
    const { svc, prisma } = buildService(accounts, { cash: { _sum: { debit: 10, credit: 0 } } });
    await svc.trialBalance({ asOf: '2026-09-01' });
    const aggCall = prisma.voucherEntry.aggregate.mock.calls[0][0];
    expect(aggCall.where.voucher).toMatchObject({
      status: 'posted',
      voucherDate: { lte: new Date('2026-09-01') },
    });
  });
});