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
  defaultAccounts?: { resolveAccount: ReturnType<typeof vi.fn> };
  fiscal?: { assertOpen: ReturnType<typeof vi.fn> };
}) {
  const prisma = overrides?.prisma ?? {
    voucher: { findUnique: vi.fn(), findMany: vi.fn() },
    voucherEntry: { findMany: vi.fn() },
    systemSetting: { findFirst: vi.fn() },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn({})),
    runInTransaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn({})),
  };
  const audit = overrides?.audit ?? { record: vi.fn().mockResolvedValue(undefined) };
  const numbering = overrides?.numbering ?? { next: vi.fn().mockResolvedValue('JV-000001') };
  const accounting = new AccountingService({} as never, {} as never);
  const defaultAccounts = overrides?.defaultAccounts ?? {
    resolveAccount: vi.fn().mockResolvedValue('cash'),
  };
  const fiscal = overrides?.fiscal ?? { assertOpen: vi.fn().mockResolvedValue(undefined) };
  const svc = new VouchersService(
    prisma as never,
    audit as never,
    numbering as never,
    accounting as never,
    defaultAccounts as never,
    fiscal as never,
  );
  return { svc, prisma, audit, numbering, accounting, defaultAccounts, fiscal };
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
    const txFactory = () => ({
      voucher: { create: vi.fn().mockResolvedValue(created), findUnique: vi.fn(), update: vi.fn() },
    });
    const runTx = async (fn: (tx: unknown) => unknown) => fn(txFactory());
    const prisma = {
      $transaction: vi.fn(runTx),
      runInTransaction: vi.fn(runTx),
    };
    const audit = { record: vi.fn().mockResolvedValue(undefined) };
    const numbering = { next: vi.fn().mockResolvedValue('JV-000001') };
    const accounting = new AccountingService({} as never, {} as never);
    const defaultAccounts = { resolveAccount: vi.fn().mockResolvedValue('cash') };
    const fiscal = { assertOpen: vi.fn().mockResolvedValue(undefined) };
    const svc = new VouchersService(
      prisma as never,
      audit as never,
      numbering as never,
      accounting as never,
      defaultAccounts as never,
      fiscal as never,
    );

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
    const runTx = async (fn: (tx: unknown) => unknown) => {
      const accounting = new AccountingService({} as never, {} as never);
      const inside = {
        ...draft,
        entries: [
          { mainAccountId: 'cash', debit: 500, credit: 0 },
          { mainAccountId: 'capital', debit: 0, credit: 500 },
        ],
      };
      const tx = { voucher: { findUnique: vi.fn().mockResolvedValue(inside), update: vi.fn().mockResolvedValue(posted) } };
      return fn({ ...tx, accounting });
    };
    const prisma = {
      voucher: {
        findUnique: vi.fn().mockResolvedValue(draft),
        update: vi.fn(),
      },
      $transaction: vi.fn(runTx),
      runInTransaction: vi.fn(runTx),
    };
    const { svc } = buildService({ prisma });
    const result = await svc.post('v1', 'u1');
    expect(result.status).toBe('posted');
  });
});

describe('VouchersService.unpost', () => {
  it('throws NOT_FOUND when the voucher does not exist', async () => {
    const prisma = { voucher: { findUnique: vi.fn().mockResolvedValue(null) } };
    const { svc } = buildService({ prisma });
    const err = await apiErrorStatus(svc.unpost('missing'));
    expect(err).toBe(404);
  });

  it('rejects a voucher that is not posted', async () => {
    const prisma = {
      voucher: { findUnique: vi.fn().mockResolvedValue({ id: 'v1', number: 'JV-1', voucherType: 'JOURNAL', status: 'draft' }) },
    };
    const { svc } = buildService({ prisma });
    const err = await apiErrorStatus(svc.unpost('v1'));
    expect(err).toBe(422);
  });

  it('rejects opening balance vouchers (auto-managed)', async () => {
    const prisma = {
      voucher: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'v1', number: 'OB-000001', voucherType: 'JOURNAL', status: 'posted', reference: 'OB:abc123',
        }),
      },
    };
    const { svc } = buildService({ prisma });
    const msg = await apiErrorMessage(svc.unpost('v1'));
    expect(msg).toMatch(/Opening balance vouchers cannot be unposted/);
  });

  it('resets a posted voucher back to draft and records an UNPOST audit entry', async () => {
    const posted = { id: 'v1', number: 'JV-000001', voucherType: 'JOURNAL', status: 'posted', reference: 'REF-1' };
    const draft = { ...posted, status: 'draft', postedById: null, postedAt: null };
    const prisma = {
      voucher: { findUnique: vi.fn().mockResolvedValue(posted), update: vi.fn().mockResolvedValue(draft) },
      $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn({})),
      runInTransaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn({})),
    };
    const audit = { record: vi.fn().mockResolvedValue(undefined) };
    const { svc } = buildService({ prisma, audit });
    const result = await svc.unpost('v1', 'u1');
    expect(result.status).toBe('draft');
    expect(prisma.voucher.update).toHaveBeenCalledWith({
      where: { id: 'v1' },
      data: { status: 'draft', postedById: null, postedAt: null },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'UNPOST', module: 'VOUCHER', entityId: 'v1', message: 'JOURNAL voucher JV-000001 unposted back to draft' }),
    );
  });
});

describe('VouchersService.update', () => {
  it('edits a pending voucher and drops it back to draft', async () => {
    const pending = {
      id: 'v1', number: 'JV-000001', voucherType: 'JOURNAL', status: 'pending',
      voucherDate: new Date('2026-09-01T10:00:00Z'), reference: 'REF-1', description: 'Test voucher',
      totalDebit: 500, totalCredit: 500, entries: [] as { id: string }[],
    };
    const tx = {
      voucher: { findUnique: vi.fn().mockResolvedValue(pending), update: vi.fn().mockImplementation((args: { data: Record<string, unknown> }) => args.data) },
      voucherEntry: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    };
    const runTx = async (fn: (tx: unknown) => unknown) => fn(tx);
    const prisma = {
      voucher: { findUnique: vi.fn().mockResolvedValue(pending), update: vi.fn() },
      $transaction: vi.fn(runTx),
      runInTransaction: vi.fn(runTx),
    };
    const audit = { record: vi.fn().mockResolvedValue(undefined) };
    const { svc } = buildService({ prisma, audit });

    const result = await svc.update('v1', dto(), 'u1');
    expect(result.status).toBe('draft');
    expect(result.submittedById).toBeNull();
    expect(result.submittedAt).toBeNull();
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'UPDATE' }));
  });

  it('rejects editing a posted voucher until it is unposted', async () => {
    const posted = {
      id: 'v1', number: 'JV-000001', voucherType: 'JOURNAL', status: 'posted',
      voucherDate: new Date('2026-09-01T10:00:00Z'), entries: [] as { id: string }[],
    };
    const prisma = { voucher: { findUnique: vi.fn().mockResolvedValue(posted) } };
    const { svc } = buildService({ prisma });
    const msg = await apiErrorMessage(svc.update('v1', dto()));
    expect(msg).toMatch(/unpost it first/);
  });
});

describe('VouchersService.cancel', () => {
  it('cancels a voucher with a reason', async () => {
    const draft = { id: 'v1', number: 'JV-000001', voucherType: 'JOURNAL', status: 'draft' };
    const cancelled = { ...draft, status: 'cancelled', cancelReason: 'Wrote wrong amount' };
    const runTx = async (fn: (tx: unknown) => unknown) =>
      fn({ voucher: { findUnique: vi.fn().mockResolvedValue(draft), update: vi.fn().mockResolvedValue(cancelled) } });
    const prisma = {
      voucher: { findUnique: vi.fn().mockResolvedValue(draft), update: vi.fn() },
      $transaction: vi.fn(runTx),
      runInTransaction: vi.fn(runTx),
    };
    const { svc } = buildService({ prisma });
    const result = await svc.cancel('v1', 'Wrote wrong amount', 'u1');
    expect(result.status).toBe('cancelled');
    expect(result.cancelReason).toBe('Wrote wrong amount');
  });
});

describe('VouchersService.cashBook', () => {
  function cashBookPrisma(entries: unknown[] = []) {
    return {
      voucher: { findUnique: vi.fn(), findMany: vi.fn() },
      voucherEntry: {
        findMany: vi.fn().mockResolvedValue(entries),
        // opening aggregate: posted movements before `from`
        aggregate: vi.fn().mockResolvedValue({ _sum: { debit: 0, credit: 0 } }),
      },
      mainAccount: {
        findUnique: vi.fn().mockResolvedValue({ id: 'cash', openingBalance: 0, openingBalanceType: 'DR' }),
      },
      systemSetting: { findFirst: vi.fn() },
      $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn({})),
      runInTransaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn({})),
    };
  }

  it('throws NOT_FOUND instead of listing the whole ledger when no cash account is configured', async () => {
    const prisma = cashBookPrisma();
    const { svc } = buildService({
      prisma,
      defaultAccounts: { resolveAccount: vi.fn().mockResolvedValue(null) },
    });

    const err = await apiErrorStatus(svc.cashBook({}));
    expect(err).toBe(404);
    // The dangerous path is an unfiltered findMany over every voucher entry.
    expect(prisma.voucherEntry.findMany).not.toHaveBeenCalled();
  });

  it('always filters entries to the resolved cash account', async () => {
    const prisma = cashBookPrisma([
      { id: 'e1', debit: 100, credit: 0, voucher: { number: 'RV-1', voucherDate: new Date('2026-09-01') } },
    ]);
    const { svc } = buildService({
      prisma,
      defaultAccounts: { resolveAccount: vi.fn().mockResolvedValue('cash') },
    });

    await svc.cashBook({});

    const call = (prisma.voucherEntry.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.where.mainAccountId).toBe('cash');
  });

  it('honours an explicit accountId over the configured cash account', async () => {
    const prisma = cashBookPrisma();
    const { svc } = buildService({
      prisma,
      defaultAccounts: { resolveAccount: vi.fn().mockResolvedValue('cash') },
    });

    await svc.cashBook({ accountId: 'bank' });

    const call = (prisma.voucherEntry.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.where.mainAccountId).toBe('bank');
  });

  it('keeps both date bounds in a single inclusive voucherDate filter', async () => {
    const prisma = cashBookPrisma();
    const { svc } = buildService({
      prisma,
      defaultAccounts: { resolveAccount: vi.fn().mockResolvedValue('cash') },
    });

    await svc.cashBook({ from: '2026-09-01', to: '2026-09-30' });

    const call = (prisma.voucherEntry.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.where.voucher.voucherDate).toEqual({
      gte: new Date('2026-09-01T00:00:00.000Z'),
      lte: new Date('2026-09-30T23:59:59.999Z'),
    });
  });
});