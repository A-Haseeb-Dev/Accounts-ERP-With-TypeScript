import { describe, it, expect, vi } from 'vitest';
import { AccountingReportsService } from './accounting-reports.service';

function buildService(
  mainAccounts: unknown[],
  aggregates: Record<string, { _sum: { debit: number; credit: number } }>,
  orphanReferences: string[] = [],
) {
  const prisma = {
    mainAccount: { findMany: vi.fn().mockResolvedValue(mainAccounts) },
    // No prefix overrides configured, so the built-in SI/PI/SR/PR apply.
    systemSetting: { findMany: vi.fn().mockResolvedValue([]) },
    // The orphan guard runs one read-only query; empty means nothing is orphaned.
    $queryRawUnsafe: vi.fn().mockResolvedValue(
      orphanReferences.map((reference) => ({ reference })),
    ),
    voucherEntry: {
      aggregate: vi.fn(({ where }: { where: { mainAccountId: string; voucher?: any } }) => {
        const voucher = where.voucher ?? {};
        // The opening query targets the OB voucher directly. The movements query
        // is the mirror image - it lists the OB voucher in a NOT clause - so
        // only a direct `reference` match means "this is the opening".
        const isOpening = voucher.reference?.startsWith === 'OB:';
        return Promise.resolve(
          isOpening
            ? { _sum: { debit: 0, credit: 0 } }
            : aggregates[where.mainAccountId] ?? { _sum: { debit: 0, credit: 0 } },
        );
      }),
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
    const movementsCall = prisma.voucherEntry.aggregate.mock.calls.find(
      (args: unknown[]) => (args[0] as { where: { voucher?: Record<string, unknown> } }).where.voucher?.OR,
    );
    expect(movementsCall).toBeTruthy();
    expect((movementsCall![0] as { where: { voucher?: Record<string, unknown> } }).where.voucher).toMatchObject({
      status: 'posted',
      voucherDate: { lte: new Date('2026-09-01T23:59:59.999Z') },
    });
  });
});

describe('AccountingReportsService orphan guard', () => {
  const account = {
    id: 'cash', code: '01-01', name: 'Cash', accountType: 'ASSET',
    openingBalance: 0, status: 'active', subHead: { name: 's', headAccount: { name: 'h' } },
  };

  it('excludes vouchers whose source document was deleted outside the app', async () => {
    const { svc, prisma } = buildService(
      [account],
      { cash: { _sum: { debit: 100, credit: 0 } } },
      ['SR-2026-000001'],
    );
    await svc.trialBalance({});

    const call = prisma.voucherEntry.aggregate.mock.calls[0][0] as { where: { voucher: any } };
    expect(call.where.voucher.OR[1].AND).toEqual(
      expect.arrayContaining([
        { OR: [{ reference: null }, { reference: { notIn: ['SR-2026-000001'] } }] },
      ]),
    );
  });

  it('leaves the filter untouched when nothing is orphaned', async () => {
    const { svc, prisma } = buildService([account], { cash: { _sum: { debit: 100, credit: 0 } } });
    await svc.trialBalance({});

    const call = prisma.voucherEntry.aggregate.mock.calls[0][0] as { where: { voucher: any } };
    // Only the opening-balance exclusion; no `notIn` clause is added.
    expect(call.where.voucher.OR[1].AND).toEqual([
      { NOT: [{ reference: { startsWith: 'OB:' } }] },
    ]);
  });

  it('keeps vouchers that have no reference at all', async () => {
    // `Voucher.reference` is nullable, and every "not an opening balance" test
    // is NULL for a NULL reference. A bare `NOT (...)` therefore evaluates to
    // NULL and drops the row, which would erase every hand-written journal from
    // the ledger the moment a single orphan exists.
    const { svc, prisma } = buildService(
      [account],
      { cash: { _sum: { debit: 100, credit: 0 } } },
      ['SR-2026-000001'],
    );
    await svc.trialBalance({});

    const call = prisma.voucherEntry.aggregate.mock.calls[0][0] as { where: { voucher: any } };
    expect(call.where.voucher.OR[0]).toEqual({ reference: null });
    expect(call.where.voucher.OR).toHaveLength(2);
  });

  it('resolves the orphan lookup once per report, not once per account', async () => {
    const { svc, prisma } = buildService(
      [account, { ...account, id: 'bank', code: '01-02' }],
      { cash: { _sum: { debit: 10, credit: 0 } }, bank: { _sum: { debit: 20, credit: 0 } } },
      ['SR-2026-000001'],
    );
    await svc.trialBalance({});

    const lookups = prisma.$queryRawUnsafe.mock.calls.length;
    expect(lookups).toBe(1);
  });
});