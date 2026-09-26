import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DefaultAccountsService } from './default-accounts.service';

interface MainAccountRow {
  id: string;
  code: string;
  name: string;
  accountType: string;
  subHeadId: string | null;
  status: string;
}

function buildPrisma(opts?: { existing?: MainAccountRow[]; voucherEntryCounts?: Record<string, number> }) {
  const rows: MainAccountRow[] = opts?.existing ? [...opts.existing] : [];
  const counts = opts?.voucherEntryCounts ?? {};

  const mainAccount = {
    findFirst: vi.fn(async ({ where }: { where: { code?: string } }) =>
      where.code ? rows.find((r) => r.code === where.code) ?? null : null,
    ),
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
      rows.find((r) => r.id === where.id) ?? null,
    ),
    create: vi.fn(async ({ data }: { data: Partial<MainAccountRow> }) => {
      const row: MainAccountRow = {
        id: `new-${rows.length}`,
        code: data.code ?? '',
        name: data.name ?? '',
        accountType: data.accountType ?? 'ASSET',
        subHeadId: data.subHeadId ?? null,
        status: data.status ?? 'active',
      };
      rows.push(row);
      return row;
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<MainAccountRow> }) => {
      const row = rows.find((r) => r.id === where.id)!;
      Object.assign(row, data);
      return row;
    }),
  };

  const prisma = {
    headAccount: {
      upsert: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn(async ({ where }: { where: { code: string } }) => ({
        id: `head-${where.code}`,
        code: where.code,
        name: where.code,
      })),
    },
    subHead: {
      findFirst: vi.fn(async ({ where }: { where: { name: string } }) => ({
        id: `sub-${where.name}`,
        name: where.name,
      })),
      create: vi.fn().mockResolvedValue({}),
    },
    mainAccount,
    voucherEntry: {
      count: vi.fn(async ({ where }: { where: { mainAccountId: string } }) =>
        counts[where.mainAccountId] ?? 0,
      ),
    },
    systemSetting: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
    },
  };

  return { prisma, rows, mainAccount };
}

async function bootstrap(prisma: unknown): Promise<void> {
  const svc = new DefaultAccountsService(prisma as never);
  await (svc as unknown as { ensureDefaultAccounts: () => Promise<void> }).ensureDefaultAccounts();
}

function account(rows: MainAccountRow[], code: string): MainAccountRow {
  const row = rows.find((r) => r.code === code);
  if (!row) throw new Error(`account ${code} was never created`);
  return row;
}

describe('DefaultAccountsService.ensureDefaultAccounts', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('classifies the purchase-side accounts as current assets, not expense', async () => {
    const { prisma, rows } = buildPrisma();
    await bootstrap(prisma);

    const purchases = account(rows, '05-01');
    expect(purchases.accountType).toBe('ASSET');
    expect(purchases.subHeadId).toBe('sub-Current Assets');

    const purchaseReturns = account(rows, '05-02');
    expect(purchaseReturns.accountType).toBe('ASSET');
    expect(purchaseReturns.subHeadId).toBe('sub-Current Assets');
  });

  it('keeps the real inventory and revenue accounts on their existing types', async () => {
    const { prisma, rows } = buildPrisma();
    await bootstrap(prisma);

    expect(account(rows, '01-04').accountType).toBe('ASSET');
    expect(account(rows, '04-01').accountType).toBe('REVENUE');
    expect(account(rows, '04-02').accountType).toBe('REVENUE');
    expect(account(rows, '05-03').accountType).toBe('EXPENSE');
  });

  it('reclassifies an existing purchase account that has never been posted to', async () => {
    // Simulates an install created before the fix: 05-01 seeded as an expense.
    const { prisma, rows, mainAccount } = buildPrisma({
      existing: [
        {
          id: 'acc-1',
          code: '05-01',
          name: 'Purchases',
          accountType: 'EXPENSE',
          subHeadId: 'sub-Cost of Sales',
          status: 'active',
        },
      ],
    });
    await bootstrap(prisma);

    const purchases = account(rows, '05-01');
    expect(purchases.accountType).toBe('ASSET');
    expect(purchases.subHeadId).toBe('sub-Current Assets');
    expect(mainAccount.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'acc-1' } }),
    );
  });

  it('leaves a purchase account alone once a voucher references it', async () => {
    const { prisma, rows, mainAccount } = buildPrisma({
      existing: [
        {
          id: 'acc-1',
          code: '05-01',
          name: 'Purchases',
          accountType: 'EXPENSE',
          subHeadId: 'sub-Cost of Sales',
          status: 'active',
        },
      ],
      voucherEntryCounts: { 'acc-1': 4 },
    });
    await bootstrap(prisma);

    // Re-typing an account the user has actually posted to would silently move
    // balances between the balance sheet and the P&L, so it must be left alone.
    expect(account(rows, '05-01').accountType).toBe('EXPENSE');
    expect(mainAccount.update).not.toHaveBeenCalled();
  });

  it('does not reclassify an account whose type already matches', async () => {
    const { prisma, mainAccount } = buildPrisma({
      existing: [
        {
          id: 'acc-1',
          code: '05-01',
          name: 'Purchases',
          accountType: 'ASSET',
          subHeadId: 'sub-Current Assets',
          status: 'active',
        },
      ],
    });
    await bootstrap(prisma);

    expect(mainAccount.update).not.toHaveBeenCalled();
  });
});
