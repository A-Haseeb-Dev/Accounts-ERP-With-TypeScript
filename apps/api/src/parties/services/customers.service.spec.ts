import { describe, it, expect, vi } from 'vitest';
import { CustomersService } from './customers.service';

type MockFn = ReturnType<typeof vi.fn>;

/** The paginated `voucherEntry` page query, ignoring the `calculateBalance` read. */
function ledgerCall(findMany: MockFn): { where: Record<string, unknown> } {
  const call = findMany.mock.calls.map((c) => c[0] as Record<string, unknown>).find((a) => a?.orderBy);
  return call as { where: Record<string, unknown> };
}

async function errorMessage(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (err) {
    const e = err as { getResponse?: () => unknown };
    const resp = (e.getResponse?.() ?? {}) as { error?: { message?: string } };
    return resp.error?.message ?? String((err as Error).message);
  }
  throw new Error('Expected an ApiException but none was thrown');
}

async function errorBody(p: Promise<unknown>): Promise<{ code?: string; message?: string; details?: string[] }> {
  try {
    await p;
  } catch (err) {
    const e = err as { getResponse?: () => unknown };
    const resp = (e.getResponse?.() ?? {}) as { error?: { code?: string; message?: string; details?: string[] } };
    return resp.error ?? {};
  }
  throw new Error('Expected an ApiException but none was thrown');
}

interface MockCustomersPrisma {  customer?: { findUnique?: MockFn; create?: MockFn; findMany?: MockFn; count?: MockFn; update?: MockFn; delete?: MockFn };
  town?: { findUnique?: MockFn };
  voucherEntry?: { findMany?: MockFn; count?: MockFn };
  sale?: { aggregate?: MockFn; count?: MockFn; deleteMany?: MockFn };
  salesReturn?: { aggregate?: MockFn; count?: MockFn; deleteMany?: MockFn };
}

function buildService(overrides?: { prisma?: Partial<MockCustomersPrisma> }) {
  const prisma: MockCustomersPrisma = {
    customer: {
      findUnique: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    town: { findUnique: vi.fn() },
    voucherEntry: { findMany: vi.fn(), count: vi.fn() },
    sale: { aggregate: vi.fn(), count: vi.fn(), deleteMany: vi.fn() },
    salesReturn: { aggregate: vi.fn(), count: vi.fn(), deleteMany: vi.fn() },
    ...(overrides?.prisma ?? {}),
  } as MockCustomersPrisma;
  const audit = { record: vi.fn() };
  const numbering = { next: vi.fn() };
  const svc = new CustomersService(prisma as never, audit as never, numbering as never);
  return { svc, prisma, audit, numbering };
}

const created = { id: 'c1', code: 'C-003', name: 'Test Customer', status: 'active', openingBalance: 0 };

describe('CustomersService.create code generation', () => {
  it('auto-generates a sequential code when code is omitted', async () => {
    const { svc, prisma, numbering } = buildService();
    numbering.next.mockResolvedValue('C-003');
    (prisma.customer?.create as ReturnType<typeof vi.fn>).mockResolvedValue(created);

    const result = await svc.create({ name: 'Test Customer' }, 'u1');

    expect(numbering.next).toHaveBeenCalledWith('customer', 'C', undefined, 3, { year: false });
    expect(prisma.customer?.findUnique).not.toHaveBeenCalled();
    expect(prisma.customer?.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ code: 'C-003' }) }),
    );
    expect(result.code).toBe('C-003');
  });

  it('respects an explicitly provided code', async () => {
    const { svc, prisma, numbering } = buildService();
    (prisma.customer?.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.customer?.create as ReturnType<typeof vi.fn>).mockResolvedValue({ ...created, code: 'C-9' });

    const result = await svc.create({ name: 'Test Customer', code: 'C-9' }, 'u1');

    expect(numbering.next).not.toHaveBeenCalled();
    expect(prisma.customer?.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ code: 'C-9' }) }),
    );
    expect(result.code).toBe('C-9');
  });

  it('rejects a duplicate explicit code', async () => {
    const { svc, prisma, numbering } = buildService();
    (prisma.customer?.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'existing', code: 'C-9' });

    const msg = await errorMessage(svc.create({ name: 'Test Customer', code: 'C-9' }));
    expect(msg).toBe('Customer code already exists');
    expect(numbering.next).not.toHaveBeenCalled();
    expect(prisma.customer?.create).not.toHaveBeenCalled();
  });
});

describe('CustomersService.remove', () => {
  function stubBalanceCalls(prisma: MockCustomersPrisma) {
    (prisma.customer?.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(created);
    (prisma.voucherEntry?.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.sale?.aggregate as ReturnType<typeof vi.fn>).mockResolvedValue({ _sum: { grandTotal: 0, amountPaid: 0 } });
    (prisma.salesReturn?.aggregate as ReturnType<typeof vi.fn>).mockResolvedValue({ _sum: { grandTotal: 0 } });
  }

  it('warns with reference counts and blocks unless forced', async () => {
    const { svc, prisma } = buildService();
    stubBalanceCalls(prisma);
    (prisma.sale?.count as ReturnType<typeof vi.fn>).mockResolvedValue(3);
    (prisma.salesReturn?.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);

    const body = await errorBody(svc.remove('c1', 'u1'));

    expect(body.code).toBe('REFERENCES_EXIST');
    expect(body.details).toEqual(['3 sale invoices', '1 sales return']);
    expect(prisma.customer?.delete).not.toHaveBeenCalled();
  });

  it('cascades sales and returns when forced', async () => {
    const { svc, prisma, audit } = buildService();
    stubBalanceCalls(prisma);
    (prisma.sale?.count as ReturnType<typeof vi.fn>).mockResolvedValue(3);
    (prisma.salesReturn?.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);
    (prisma.salesReturn?.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 });
    (prisma.sale?.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 3 });
    (prisma.customer?.delete as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'c1' });

    const result = await svc.remove('c1', 'u1', true);

    expect(prisma.salesReturn?.deleteMany).toHaveBeenCalledWith({ where: { customerId: 'c1' } });
    expect(prisma.sale?.deleteMany).toHaveBeenCalledWith({ where: { customerId: 'c1' } });
    expect(prisma.customer?.delete).toHaveBeenCalledWith({ where: { id: 'c1' } });
    expect(audit.record).toHaveBeenCalled();
    expect(result).toEqual({ id: 'c1', deleted: true });
  });

  it('deletes directly when there are no references', async () => {
    const { svc, prisma } = buildService();
    stubBalanceCalls(prisma);
    (prisma.sale?.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    (prisma.salesReturn?.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    (prisma.customer?.delete as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'c1' });

    const result = await svc.remove('c1', 'u1');

    expect(prisma.sale?.deleteMany).not.toHaveBeenCalled();
    expect(prisma.salesReturn?.deleteMany).not.toHaveBeenCalled();
    expect(prisma.customer?.delete).toHaveBeenCalledWith({ where: { id: 'c1' } });
    expect(result).toEqual({ id: 'c1', deleted: true });
  });
});

describe('CustomersService.ledger', () => {
  const linked = { id: 'c1', code: 'C-003', name: 'Test Customer', mainAccountId: 'AR', openingBalance: 0 };

  /**
   * `findLedger` calls `findOne` first, which itself reads `voucherEntry` through
   * `calculateBalance`. That call has no `orderBy`, the page-of-entries call has
   * `skip` + `take`, and the preceding-rows call has `take` but no `skip` — so
   * each query can be told apart without relying on call order.
   */
  function ledgerService(handlers: { balance?: unknown[]; entries?: unknown[]; preceding?: unknown[]; total?: number }) {
    const findMany = vi.fn((args: Record<string, unknown> = {}) => {
      if (!args.orderBy) return Promise.resolve(handlers.balance ?? []);
      if (args.skip === undefined) return Promise.resolve(handlers.preceding ?? []);
      return Promise.resolve(handlers.entries ?? []);
    });
    const prisma = {
      customer: { findUnique: vi.fn().mockResolvedValue(linked) },
      voucherEntry: { findMany, count: vi.fn().mockResolvedValue(handlers.total ?? 0) },
      sale: { aggregate: vi.fn() },
      salesReturn: { aggregate: vi.fn() },
    };
    const svc = new CustomersService(prisma as never, { record: vi.fn() } as never, { next: vi.fn() } as never);
    return { svc, findMany, prisma };
  }

  it('rejects a customer with no linked main account', async () => {
    const prisma = {
      customer: { findUnique: vi.fn().mockResolvedValue({ ...linked, mainAccountId: null }) },
      voucherEntry: { findMany: vi.fn().mockResolvedValue([]) },
      sale: { aggregate: vi.fn().mockResolvedValue({ _sum: { grandTotal: 0, amountPaid: 0 } }) },
      salesReturn: { aggregate: vi.fn().mockResolvedValue({ _sum: { grandTotal: 0 } }) },
    };
    const svc = new CustomersService(prisma as never, { record: vi.fn() } as never, { next: vi.fn() } as never);
    const msg = await errorMessage(svc.findLedger('c1', {}));
    expect(msg).toMatch(/no linked account/i);
  });

  it('keeps both date bounds in one voucherDate filter instead of letting the second spread win', async () => {
    const { svc, findMany } = ledgerService({});
    await svc.findLedger('c1', { from: '2026-09-01', to: '2026-09-30' });

    const where = ledgerCall(findMany).where;
    expect(where.voucher).toEqual({
      status: 'posted',
      voucherDate: {
        gte: new Date('2026-09-01T00:00:00.000Z'),
        lte: new Date('2026-09-30T23:59:59.999Z'),
      },
    });
  });

  it('applies no voucherDate key when no dates are supplied', async () => {
    const { svc, findMany } = ledgerService({});
    await svc.findLedger('c1', {});
    expect(ledgerCall(findMany).where.voucher).toEqual({ status: 'posted' });
  });

  it('seeds the running balance with preceding entries so page 2 does not restart', async () => {
    const { svc } = ledgerService({
      entries: [{ id: 'e3', debit: 40, credit: 0, voucher: { number: 'RV-3', voucherDate: new Date('2026-09-03') } }],
      preceding: [
        { id: 'e1', debit: 100, credit: 0 },
        { id: 'e2', debit: 0, credit: 30 },
      ],
      total: 3,
    });

    const result = await svc.findLedger('c1', { page: 2, pageSize: 1 });

    // opening 0 + 100 - 30 carried from the preceding page, then +40 for this row
    expect(result.entries[0].runningBalance).toBe(110);
    expect(result.totalPages).toBe(3);
  });
});