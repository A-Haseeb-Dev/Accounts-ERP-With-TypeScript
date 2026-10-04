import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AccountingService, VoucherEntryInput } from './accounting.service';

interface ApiErrorShape {
  status: number;
  code: string;
  message: string;
}

function syncApiError(fn: () => void): ApiErrorShape {
  try {
    fn();
  } catch (err) {
    const e = err as { getResponse?: () => unknown; getStatus?: () => number; status?: number };
    const resp = (e.getResponse?.() ?? {}) as { error?: { message?: string; code?: string } };
    return {
      status: e.status ?? e.getStatus?.() ?? 0,
      code: resp.error?.code ?? '',
      message: resp.error?.message ?? String((err as Error).message),
    };
  }
  throw new Error('Expected an ApiException but none was thrown');
}

async function apiError(p: Promise<unknown>): Promise<ApiErrorShape> {
  try {
    await p;
  } catch (err) {
    return syncApiError(() => {
      throw err;
    });
  }
  throw new Error('Expected an ApiException but none was thrown');
}

const makeTx = (overrides: Record<string, unknown> = {}) => ({
  voucher: {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  ...overrides,
});

describe('AccountingService.assertBalanced', () => {
  let svc: AccountingService;

  beforeEach(() => {
    svc = new AccountingService({} as never, {} as never, { resolveAccount: async () => null } as never);
  });

  it('rejects an empty entry list', () => {
    const err = syncApiError(() => svc.assertBalanced([]));
    expect(err.message).toMatch(/at least one debit and one credit/);
  });

  it('rejects entries whose totals do not match', () => {
    const entries: VoucherEntryInput[] = [
      { mainAccountId: 'a', debit: 100 },
      { mainAccountId: 'b', credit: 90 },
    ];
    const err = syncApiError(() => svc.assertBalanced(entries));
    expect(err.code).toBe('UNBALANCED_VOUCHER');
    expect(err.status).toBe(422);
    expect(err.message).toMatch(/Unbalanced voucher/);
  });

  it('rejects negative debit or credit amounts', () => {
    const entries: VoucherEntryInput[] = [
      { mainAccountId: 'a', debit: -1 },
      { mainAccountId: 'b', credit: -1 },
    ];
    const err = syncApiError(() => svc.assertBalanced(entries));
    expect(err.message).toMatch(/amounts cannot be negative/);
  });

  it('rejects an entry with neither a debit nor a credit amount', () => {
    const entries: VoucherEntryInput[] = [
      { mainAccountId: 'a', debit: 100 },
      { mainAccountId: 'b', credit: 100 },
      { mainAccountId: 'c' },
    ];
    const err = syncApiError(() => svc.assertBalanced(entries));
    expect(err.message).toMatch(/must have a debit or credit amount/);
  });

  it('accepts a balanced entry set', () => {
    const entries: VoucherEntryInput[] = [
      { mainAccountId: 'a', debit: 100.5 },
      { mainAccountId: 'b', credit: 100.5 },
    ];
    expect(() => svc.assertBalanced(entries)).not.toThrow();
  });
});

describe('AccountingService.createVoucher', () => {
  let svc: AccountingService;

  beforeEach(() => {
    svc = new AccountingService({} as never, {} as never, { resolveAccount: async () => null } as never);
  });

  it('throws for an unbalanced draft', async () => {
    const tx = makeTx();
    const err = await apiError(
      svc.createVoucher(
        tx,
        {
          voucherType: 'JOURNAL',
          voucherDate: new Date('2026-09-01'),
          entries: [{ mainAccountId: 'a', debit: 50 }],
        },
        'JV-000001',
      ),
    );
    expect(err.message).toMatch(/Unbalanced voucher/);
    expect(tx.voucher.create).not.toHaveBeenCalled();
  });

  it('creates a draft voucher with balanced totals and nested entries', async () => {
    const tx = makeTx();
    tx.voucher.create.mockResolvedValue({ id: 'v1', number: 'JV-000001', status: 'draft', totalDebit: 150, totalCredit: 150 });
    const result = await svc.createVoucher(
      tx,
      {
        voucherType: 'JOURNAL',
        voucherDate: new Date('2026-09-01T10:00:00Z'),
        description: 'Test',
        reference: 'REF-1',
        entries: [
          { mainAccountId: 'cash', debit: 150, narration: 'in' },
          { mainAccountId: 'capital', credit: 150, narration: 'out' },
        ],
        createdById: 'u1',
      },
      'JV-000001',
    );

    expect(result.id).toBe('v1');
    expect(tx.voucher.create).toHaveBeenCalledTimes(1);
    const call = tx.voucher.create.mock.calls[0][0];
    expect(call.data).toMatchObject({
      number: 'JV-000001',
      voucherType: 'JOURNAL',
      status: 'draft',
      totalDebit: 150,
      totalCredit: 150,
      createdById: 'u1',
    });
    expect(call.data.entries.create).toHaveLength(2);
    expect(call.data.entries.create[0]).toMatchObject({ mainAccountId: 'cash', debit: 150, credit: 0 });
  });
});

describe('AccountingService.postVoucher', () => {
  let svc: AccountingService;

  beforeEach(() => {
    svc = new AccountingService({} as never, {} as never, { resolveAccount: async () => null } as never);
  });

  it('throws NOT_FOUND for a missing voucher', async () => {
    const tx = makeTx();
    tx.voucher.findUnique.mockResolvedValue(null);
    const err = await apiError(svc.postVoucher(tx, 'missing'));
    expect(err.status).toBe(404);
    expect(err.message).toMatch(/not found/i);
  });

  it('is idempotent for an already-posted voucher', async () => {
    const tx = makeTx();
    const posted = { id: 'v1', status: 'posted', entries: [] };
    tx.voucher.findUnique.mockResolvedValue(posted);
    const result = await svc.postVoucher(tx, 'v1');
    expect(result).toBe(posted);
    expect(tx.voucher.update).not.toHaveBeenCalled();
  });

  it('rejects posting a cancelled voucher', async () => {
    const tx = makeTx();
    tx.voucher.findUnique.mockResolvedValue({ id: 'v1', status: 'cancelled', entries: [] });
    const err = await apiError(svc.postVoucher(tx, 'v1'));
    expect(err.message).toMatch(/cancelled voucher cannot be posted/);
  });

  it('posts a draft voucher', async () => {
    const tx = makeTx();
    tx.voucher.findUnique.mockResolvedValue({
      id: 'v1',
      status: 'draft',
      entries: [
        { mainAccountId: 'a', debit: 100, credit: 0 },
        { mainAccountId: 'b', debit: 0, credit: 100 },
      ],
    });
    tx.voucher.update.mockResolvedValue({ id: 'v1', status: 'posted', postedById: 'u1' });
    const result = await svc.postVoucher(tx, 'v1', 'u1');
    expect(result.status).toBe('posted');
    expect(tx.voucher.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'v1' },
        data: expect.objectContaining({ status: 'posted', postedById: 'u1' }),
      }),
    );
  });
});

describe('AccountingService.cancelVoucher', () => {
  let svc: AccountingService;

  beforeEach(() => {
    svc = new AccountingService({} as never, {} as never, { resolveAccount: async () => null } as never);
  });

  it('throws NOT_FOUND for a missing voucher', async () => {
    const tx = makeTx();
    tx.voucher.findUnique.mockResolvedValue(null);
    const err = await apiError(svc.cancelVoucher(tx, 'missing', 'reason'));
    expect(err.status).toBe(404);
  });

  it('is idempotent for an already-cancelled voucher', async () => {
    const tx = makeTx();
    const cancelled = { id: 'v1', status: 'cancelled' };
    tx.voucher.findUnique.mockResolvedValue(cancelled);
    const result = await svc.cancelVoucher(tx, 'v1', 'reason');
    expect(result).toBe(cancelled);
    expect(tx.voucher.update).not.toHaveBeenCalled();
  });

  it('cancels a draft or posted voucher with reason and actor', async () => {
    const tx = makeTx();
    tx.voucher.findUnique.mockResolvedValue({ id: 'v1', status: 'draft' });
    tx.voucher.update.mockResolvedValue({ id: 'v1', status: 'cancelled' });
    await svc.cancelVoucher(tx, 'v1', 'Wrong entry', 'u1');
    const updateArgs = tx.voucher.update.mock.calls[0][0];
    expect(updateArgs.data).toMatchObject({
      status: 'cancelled',
      cancelReason: 'Wrong entry',
      cancelledBy: 'u1',
    });
    expect(updateArgs.data.cancelledAt).toBeInstanceOf(Date);
  });
});

describe('AccountingService.accountBalance', () => {
  it('computes opening balance plus posted movements', async () => {
    const prisma = {
      mainAccount: { findUnique: vi.fn().mockResolvedValue({ id: 'cash', openingBalance: 1000 }) },
      voucherEntry: {
        aggregate: vi
          .fn()
          .mockResolvedValueOnce({ _sum: { debit: 0, credit: 0 } })
          .mockResolvedValue({ _sum: { debit: 500, credit: 200 } }),
      },
    };
    const svc = new AccountingService(prisma as never, {} as never, { resolveAccount: async () => null } as never);
    const balance = await svc.accountBalance('cash');
    expect(balance).toBe(1300);
    expect(prisma.voucherEntry.aggregate).toHaveBeenCalledTimes(2);
  });

  it('uses the posted opening-balance voucher when one exists', async () => {
    const prisma = {
      mainAccount: {
        findUnique: vi.fn().mockResolvedValue({ id: 'cash', openingBalance: 1000, openingBalanceType: 'CR' }),
      },
      voucherEntry: {
        aggregate: vi
          .fn()
          .mockResolvedValueOnce({ _sum: { debit: 500, credit: 0 } })
          .mockResolvedValue({ _sum: { debit: 0, credit: 200 } }),
      },
    };
    const svc = new AccountingService(prisma as never, {} as never, { resolveAccount: async () => null } as never);
    const balance = await svc.accountBalance('cash');
    expect(balance).toBe(300);
  });

  it('throws NOT_FOUND when the account is missing', async () => {
    const prisma = {
      mainAccount: { findUnique: vi.fn().mockResolvedValue(null) },
    };
    const svc = new AccountingService(prisma as never, {} as never, { resolveAccount: async () => null } as never);
    const err = await apiError(svc.accountBalance('ghost'));
    expect(err.status).toBe(404);
  });
});

/**
 * Regression cover for "Invalid prisma.voucher.create() invocation: Foreign
 * key constraint violated: VoucherEntry_mainAccountId_fkey".
 *
 * The configured Opening Equity id can outlive the account it points at, because
 * the chart of accounts is rebuilt by hand. Trusting that id made every account
 * created with an opening balance fail on insert.
 */
describe('AccountingService.syncOpeningVoucher', () => {
  const account = {
    id: 'acc-1',
    code: '1101',
    name: 'Cash',
    openingBalance: 5000,
    openingBalanceType: 'DR',
    createdAt: new Date('2024-01-01T00:00:00Z'),
  };

  /**
   * @param accounts Ids that actually exist in `MainAccount`, keyed by type.
   * @param setting  The stored `accounting.opening_equity_account` value.
   */
  const build = (options: {
    existing?: Record<string, { accountType: string; status: string }>;
    setting?: string | null;
    entries?: Array<Record<string, unknown>>;
  }) => {
    const { existing = {}, setting = null, entries = [] } = options;
    const settingUpdate = vi.fn().mockResolvedValue({});
    const voucherCreate = vi.fn().mockResolvedValue({ id: 'v1', entries });
    const findUnique = vi.fn().mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve(
        where.id === account.id
          ? account
          : existing[where.id]
            ? { id: where.id, ...existing[where.id] }
            : null,
      ),
    );
    const tx = {
      voucher: {
        create: voucherCreate,
        findFirst: vi.fn().mockResolvedValue(null),
        // `findUnique` serves two purposes here: the free-number probe (by
        // `number`, which must miss) and `postVoucher`'s read-back of the draft
        // it just created (by `id`, which must return balanced entries).
        findUnique: vi.fn().mockImplementation(({ where }: { where: { id?: string; number?: string } }) =>
          Promise.resolve(
            where.number !== undefined
              ? null
              : {
                  id: 'v1',
                  status: 'draft',
                  entries: entries.length
                    ? entries
                    : [
                        { mainAccountId: 'acc-1', debit: 5000, credit: 0 },
                        { mainAccountId: 'equity', credit: 5000, debit: 0 },
                      ],
                },
          ),
        ),
        update: vi.fn().mockResolvedValue({ id: 'v1', status: 'posted' }),
      },
      voucherEntry: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
      systemSetting: { upsert: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      mainAccount: { findUnique, findFirst: vi.fn().mockResolvedValue(null) },
      systemSetting: {
        findFirst: vi.fn().mockResolvedValue(setting ? { id: 's1', value: setting } : null),
        update: settingUpdate,
      },
      $transaction: vi.fn().mockImplementation((fn: (t: unknown) => unknown) => fn(tx)),
    };
    const svc = new AccountingService(prisma as never, {
      next: vi.fn().mockResolvedValue('OB-1'),
    } as never, { resolveAccount: async () => null } as never);
    return { svc, tx, prisma, voucherCreate, settingUpdate, findUnique };
  };

  it('ignores a configured equity id whose account no longer exists', async () => {
    const { svc, tx, voucherCreate } = build({
      setting: 'deleted-equity-id',
      existing: { 'acc-1': { accountType: 'ASSET', status: 'active' } },
    });

    const result = await svc.syncOpeningVoucher('acc-1');

    // No equity account is left to balance against, so nothing is posted and
    // nothing is written - critically, no voucher is created.
    expect(result).toEqual({ posted: false, reason: 'NO_EQUITY_ACCOUNT' });
    expect(voucherCreate).not.toHaveBeenCalled();
    expect(tx.voucher.findFirst).toHaveBeenCalled();
  });

  it('clears a stale configured id so it is not re-verified forever', async () => {
    const { svc, prisma } = build({ setting: 'deleted-equity-id' });

    await svc.syncOpeningVoucher('acc-1');

    expect(prisma.systemSetting.update).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { value: null },
    });
  });

  it('posts the opening voucher when the configured equity account is valid', async () => {
    const { svc, voucherCreate } = build({
      setting: 'equity-1',
      existing: {
        'acc-1': { accountType: 'ASSET', status: 'active' },
        'equity-1': { accountType: 'EQUITY', status: 'active' },
      },
    });

    const result = await svc.syncOpeningVoucher('acc-1');

    expect(result.posted).toBe(true);
    expect(voucherCreate).toHaveBeenCalled();
    const rows = voucherCreate.mock.calls[0][0].data.entries.create;
    expect(rows.map((e: { mainAccountId: string }) => e.mainAccountId).sort()).toEqual([
      'acc-1',
      'equity-1',
    ]);
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ mainAccountId: 'acc-1', debit: 5000, credit: 0 }),
        expect.objectContaining({ mainAccountId: 'equity-1', debit: 0, credit: 5000 }),
      ]),
    );
  });

  it('refuses to balance an opening balance against a non-equity account', async () => {
    const { svc, voucherCreate } = build({
      setting: 'some-asset',
      existing: {
        'acc-1': { accountType: 'ASSET', status: 'active' },
        'some-asset': { accountType: 'ASSET', status: 'active' },
      },
    });

    const result = await svc.syncOpeningVoucher('acc-1');

    expect(result).toEqual({ posted: false, reason: 'NO_EQUITY_ACCOUNT' });
    expect(voucherCreate).not.toHaveBeenCalled();
  });

  it('refuses to balance an opening balance against an inactive account', async () => {
    const { svc, voucherCreate } = build({
      setting: 'equity-1',
      existing: {
        'acc-1': { accountType: 'ASSET', status: 'active' },
        'equity-1': { accountType: 'EQUITY', status: 'inactive' },
      },
    });

    const result = await svc.syncOpeningVoucher('acc-1');

    expect(result).toEqual({ posted: false, reason: 'NO_EQUITY_ACCOUNT' });
    expect(voucherCreate).not.toHaveBeenCalled();
  });

  it('never uses the account being opened as its own counterpart', async () => {
    const { svc, voucherCreate } = build({
      setting: 'acc-1',
      existing: { 'acc-1': { accountType: 'EQUITY', status: 'active' } },
    });

    const result = await svc.syncOpeningVoucher('acc-1');

    expect(result).toEqual({ posted: false, reason: 'NO_EQUITY_ACCOUNT' });
    expect(voucherCreate).not.toHaveBeenCalled();
  });

  it('falls back to any usable equity account when the setting is absent', async () => {
    const { svc, prisma, voucherCreate } = build({
      setting: null,
      existing: { 'acc-1': { accountType: 'ASSET', status: 'active' } },
    });
    prisma.mainAccount.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'equity-9' });

    const result = await svc.syncOpeningVoucher('acc-1');

    expect(result.posted).toBe(true);
    expect(voucherCreate).toHaveBeenCalled();
    const rows = voucherCreate.mock.calls[0][0].data.entries.create;
    expect(rows.map((e: { mainAccountId: string }) => e.mainAccountId)).toContain('equity-9');
  });

  it('falls back to name lookup when the configured id is stale', async () => {
    const { svc, prisma, voucherCreate } = build({
      setting: 'deleted-equity-id',
      existing: { 'acc-1': { accountType: 'ASSET', status: 'active' } },
    });
    prisma.mainAccount.findFirst.mockResolvedValueOnce({
      id: 'equity-by-name',
      accountType: 'EQUITY',
      status: 'active',
    });

    const result = await svc.syncOpeningVoucher('acc-1');

    expect(result.posted).toBe(true);
    expect(voucherCreate).toHaveBeenCalled();
  });

  it('removes the opening voucher without an equity account when the balance is zeroed', async () => {
    const { svc, prisma, voucherCreate } = build({ setting: 'deleted-equity-id' });
    prisma.mainAccount.findUnique.mockResolvedValueOnce({ ...account, openingBalance: 0 });

    const result = await svc.syncOpeningVoucher('acc-1');

    // Zeroing a balance only needs to clear the old voucher, never a
    // counterpart account, so it still succeeds.
    expect(result).toEqual({ posted: true });
    expect(voucherCreate).not.toHaveBeenCalled();
  });
});