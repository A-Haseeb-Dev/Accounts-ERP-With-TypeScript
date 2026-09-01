import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AccountingService, VoucherEntryInput } from './accounting.service';
import { ApiException } from '../exceptions/api.exception';

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
    svc = new AccountingService({} as never);
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
    svc = new AccountingService({} as never);
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
    svc = new AccountingService({} as never);
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
    tx.voucher.update.mockResolvedValue({ id: 'v1', status: 'posted' });
    const result = await svc.postVoucher(tx, 'v1', 'u1');
    expect(result.status).toBe('posted');
    expect(tx.voucher.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'v1' },
        data: { status: 'posted' },
      }),
    );
  });
});

describe('AccountingService.cancelVoucher', () => {
  let svc: AccountingService;

  beforeEach(() => {
    svc = new AccountingService({} as never);
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
        aggregate: vi.fn().mockResolvedValue({ _sum: { debit: 500, credit: 200 } }),
      },
    };
    const svc = new AccountingService(prisma as never);
    const balance = await svc.accountBalance('cash');
    expect(balance).toBe(1300);
    expect(prisma.voucherEntry.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { mainAccountId: 'cash', voucher: { status: 'posted' } },
      }),
    );
  });

  it('throws NOT_FOUND when the account is missing', async () => {
    const prisma = {
      mainAccount: { findUnique: vi.fn().mockResolvedValue(null) },
    };
    const svc = new AccountingService(prisma as never);
    const err = await apiError(svc.accountBalance('ghost'));
    expect(err.status).toBe(404);
  });
});