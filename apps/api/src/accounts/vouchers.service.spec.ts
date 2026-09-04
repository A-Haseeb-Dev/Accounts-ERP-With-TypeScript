import { describe, it, expect, vi } from 'vitest';
import { VouchersService } from './vouchers.service';
import { AccountingService } from '../common/services/accounting.service';
import { CreateVoucherDto } from './dto/vouchers.dto';

async function apiErrorMessage(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (err) {
    const e = err as { getResponse?: () => unknown };
    const resp = (e.getResponse?.() ?? {}) as { error?: { message?: string } };
    return resp.error?.message ?? String((err as Error).message);
  }
  throw new Error('Expected an ApiException but none was thrown');
}

async function apiErrorStatus(p: Promise<unknown>): Promise<number> {
  try {
    await p;
  } catch (err) {
    const e = err as { getStatus?: () => number; status?: number };
    return e.status ?? e.getStatus?.() ?? 0;
  }
  throw new Error('Expected an ApiException but none was thrown');
}

const dto = (overrides: Partial<CreateVoucherDto> = {}): CreateVoucherDto => ({
  voucherType: 'JOURNAL',
  voucherDate: new Date('2026-09-01T10:00:00Z'),
  reference: 'REF-1',
  description: 'Test voucher',
  entries: [
    { mainAccountId: 'cash', debit: 500, credit: 0, narration: 'in' },
    { mainAccountId: 'capital', debit: 0, credit: 500, narration: 'out' },
  ],
  ...overrides,
});

function buildService(overrides?: {
  prisma?: Record<string, unknown>;
  audit?: { record: ReturnType<typeof vi.fn> };
  numbering?: { next: ReturnType<typeof vi.fn> };
  fiscal?: { assertOpen: ReturnType<typeof vi.fn> };
}) {
  const prisma = overrides?.prisma ?? {
    voucher: { findUnique: vi.fn(), findMany: vi.fn() },
    voucherEntry: { findMany: vi.fn() },
    systemSetting: { findFirst: vi.fn() },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn({})),
  };
  const audit = overrides?.audit ?? { record: vi.fn().mockResolvedValue(undefined) };
  const numbering = overrides?.numbering ?? { next: vi.fn().mockResolvedValue('JV-000001') };
  const accounting = new AccountingService({} as never);
  const fiscal = overrides?.fiscal ?? { assertOpen: vi.fn().mockResolvedValue(undefined) };
  const svc = new VouchersService(prisma as never, audit as never, numbering as never, accounting as never, fiscal as never);
  return { svc, prisma, audit, numbering, accounting, fiscal };
}

describe('VouchersService.create validation', () => {
  it('requires at least one debit entry', async () => {
    const { svc } = buildService();
    const msg = await apiErrorMessage(svc.create(dto({ entries: [{ mainAccountId: 'a', credit: 100 }] })));
    expect(msg).toMatch(/A debit entry is required/);
  });

  it('requires at least one credit entry', async () => {
    const { svc } = buildService();
    const msg = await apiErrorMessage(svc.create(dto({ entries: [{ mainAccountId: 'a', debit: 100 }] })));
    expect(msg).toMatch(/A credit entry is required/);
  });

  it('rejects unbalanced entries before opening a transaction', async () => {
    const { svc, prisma } = buildService();
    const msg = await apiErrorMessage(
      svc.create(
        dto({
          entries: [
            { mainAccountId: 'a', debit: 100 },
            { mainAccountId: 'b', credit: 50 },
          ],
        }),
      ),
    );
    expect(msg).toMatch(/Unbalanced voucher/);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('VouchersService.create', () => {
  it('creates a journal voucher inside a transaction and records an audit entry', async () => {
    const created = { id: 'v1', number: 'JV-000001', totalDebit: 500, totalCredit: 500 };
    const prisma = {
      $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => {
        const tx = {
          voucher: { create: vi.fn().mockResolvedValue(created), findUnique: vi.fn(), update: vi.fn() },
        };
        return fn(tx);
      }),
    };
    const audit = { record: vi.fn().mockResolvedValue(undefined) };
    const numbering = { next: vi.fn().mockResolvedValue('JV-000001') };
    const accounting = new AccountingService({} as never);
    const fiscal = { assertOpen: vi.fn().mockResolvedValue(undefined) };
    const svc = new VouchersService(prisma as never, audit as never, numbering as never, accounting as never, fiscal as never);

    const result = await svc.create(dto(), 'u1');

    expect(result).toBe(created);
    expect(numbering.next).toHaveBeenCalledWith('voucher_journal', 'JV');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CREATE',
        module: 'VOUCHER',
        entityId: 'v1',
        message: 'JOURNAL voucher JV-000001 created (net 500)',
      }),
    );
  });
});

describe('VouchersService.post', () => {
  it('throws NOT_FOUND when the voucher does not exist', async () => {
    const prisma = { voucher: { findUnique: vi.fn().mockResolvedValue(null) } };
    const { svc } = buildService({ prisma });
    const err = await apiErrorStatus(svc.post('missing'));
    expect(err).toBe(404);
  });

  it('posts a draft voucher via the accounting engine', async () => {
    const draft = { id: 'v1', number: 'JV-000001', voucherType: 'JOURNAL', status: 'draft' };
    const posted = { ...draft, status: 'posted' };
    const prisma = {
      voucher: {
        findUnique: vi.fn().mockResolvedValue(draft),
        update: vi.fn(),
      },
      $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => {
        const accounting = new AccountingService({} as never);
        const inside = {
          ...draft,
          entries: [
            { mainAccountId: 'cash', debit: 500, credit: 0 },
            { mainAccountId: 'capital', debit: 0, credit: 500 },
          ],
        };
        const tx = { voucher: { findUnique: vi.fn().mockResolvedValue(inside), update: vi.fn().mockResolvedValue(posted) } };
        return fn({ ...tx, accounting });
      }),
    };
    const { svc } = buildService({ prisma });
    const result = await svc.post('v1', 'u1');
    expect(result.status).toBe('posted');
  });
});

describe('VouchersService.cancel', () => {
  it('cancels a voucher with a reason', async () => {
    const draft = { id: 'v1', number: 'JV-000001', voucherType: 'JOURNAL', status: 'draft' };
    const cancelled = { ...draft, status: 'cancelled', cancelReason: 'Wrote wrong amount' };
    const prisma = {
      voucher: { findUnique: vi.fn().mockResolvedValue(draft), update: vi.fn() },
      $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => {
        const tx = { voucher: { findUnique: vi.fn().mockResolvedValue(draft), update: vi.fn().mockResolvedValue(cancelled) } };
        return fn(tx);
      }),
    };
    const { svc } = buildService({ prisma });
    const result = await svc.cancel('v1', 'Wrote wrong amount', 'u1');
    expect(result.status).toBe('cancelled');
    expect(result.cancelReason).toBe('Wrote wrong amount');
  });
});