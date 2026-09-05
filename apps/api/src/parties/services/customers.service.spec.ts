import { describe, it, expect, vi } from 'vitest';
import { CustomersService } from './customers.service';

type MockFn = ReturnType<typeof vi.fn>;

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

interface MockCustomersPrisma {
  customer?: { findUnique?: MockFn; create?: MockFn; findMany?: MockFn; count?: MockFn; update?: MockFn; delete?: MockFn };
  town?: { findUnique?: MockFn };
  voucherEntry?: { findMany?: MockFn };
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
    voucherEntry: { findMany: vi.fn() },
    sale: { aggregate: vi.fn(), count: vi.fn(), deleteMany: vi.fn() },
    salesReturn: { aggregate: vi.fn(), count: vi.fn(), deleteMany: vi.fn() },
    ...(overrides?.prisma ?? {}),
  } as MockCustomersPrisma;
  const audit = { record: vi.fn() };
  const numbering = { next: vi.fn() };
  const svc = new CustomersService(prisma as never, audit as never, numbering as never);
  return { svc, prisma, audit, numbering };
}

const created = { id: 'c1', code: 'CST-000001', name: 'Test Customer', status: 'active', openingBalance: 0 };

describe('CustomersService.create code generation', () => {
  it('auto-generates a sequential code when code is omitted', async () => {
    const { svc, prisma, numbering } = buildService();
    numbering.next.mockResolvedValue('CST-000001');
    (prisma.customer?.create as ReturnType<typeof vi.fn>).mockResolvedValue(created);

    const result = await svc.create({ name: 'Test Customer' }, 'u1');

    expect(numbering.next).toHaveBeenCalledWith('customer', 'CST');
    expect(prisma.customer?.findUnique).not.toHaveBeenCalled();
    expect(prisma.customer?.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ code: 'CST-000001' }) }),
    );
    expect(result.code).toBe('CST-000001');
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