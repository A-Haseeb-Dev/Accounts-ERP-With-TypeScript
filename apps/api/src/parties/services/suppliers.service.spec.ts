import { describe, it, expect, vi } from 'vitest';
import { SuppliersService } from './suppliers.service';

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

interface MockSuppliersPrisma {
  supplier?: { findUnique?: MockFn; create?: MockFn; findMany?: MockFn; count?: MockFn; update?: MockFn; delete?: MockFn };
  town?: { findUnique?: MockFn };
  voucherEntry?: { findMany?: MockFn };
  purchase?: { aggregate?: MockFn; count?: MockFn; deleteMany?: MockFn };
  purchaseReturn?: { aggregate?: MockFn; count?: MockFn; deleteMany?: MockFn };
}

function buildService(overrides?: { prisma?: Partial<MockSuppliersPrisma> }) {
  const prisma: MockSuppliersPrisma = {
    supplier: {
      findUnique: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    town: { findUnique: vi.fn() },
    voucherEntry: { findMany: vi.fn() },
    purchase: { aggregate: vi.fn(), count: vi.fn(), deleteMany: vi.fn() },
    purchaseReturn: { aggregate: vi.fn(), count: vi.fn(), deleteMany: vi.fn() },
    ...(overrides?.prisma ?? {}),
  } as MockSuppliersPrisma;
  const audit = { record: vi.fn() };
  const numbering = { next: vi.fn() };
  const svc = new SuppliersService(prisma as never, audit as never, numbering as never);
  return { svc, prisma, audit, numbering };
}

const created = { id: 's1', code: 'SUP-000001', name: 'Test Supplier', status: 'active' };

describe('SuppliersService.create code generation', () => {
  it('auto-generates a sequential code when code is omitted', async () => {
    const { svc, prisma, numbering } = buildService();
    numbering.next.mockResolvedValue('SUP-000001');
    (prisma.supplier?.create as ReturnType<typeof vi.fn>).mockResolvedValue(created);

    const result = await svc.create({ name: 'Test Supplier' }, 'u1');

    expect(numbering.next).toHaveBeenCalledWith('supplier', 'SUP');
    expect(prisma.supplier?.findUnique).not.toHaveBeenCalled();
    expect(prisma.supplier?.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ code: 'SUP-000001' }) }),
    );
    expect(result.code).toBe('SUP-000001');
  });

  it('respects an explicitly provided code', async () => {
    const { svc, prisma, numbering } = buildService();
    (prisma.supplier?.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.supplier?.create as ReturnType<typeof vi.fn>).mockResolvedValue({ ...created, code: 'S-9' });

    const result = await svc.create({ name: 'Test Supplier', code: 'S-9' }, 'u1');

    expect(numbering.next).not.toHaveBeenCalled();
    expect(prisma.supplier?.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ code: 'S-9' }) }),
    );
    expect(result.code).toBe('S-9');
  });

  it('rejects a duplicate explicit code', async () => {
    const { svc, prisma, numbering } = buildService();
    (prisma.supplier?.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'existing', code: 'S-9' });

    const msg = await errorMessage(svc.create({ name: 'Test Supplier', code: 'S-9' }));
    expect(msg).toBe('Supplier code already exists');
    expect(numbering.next).not.toHaveBeenCalled();
    expect(prisma.supplier?.create).not.toHaveBeenCalled();
  });
});

describe('SuppliersService.remove', () => {
  function stubBalanceCalls(prisma: MockSuppliersPrisma) {
    (prisma.supplier?.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(created);
    (prisma.voucherEntry?.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.purchase?.aggregate as ReturnType<typeof vi.fn>).mockResolvedValue({ _sum: { grandTotal: 0, amountPaid: 0 } });
    (prisma.purchaseReturn?.aggregate as ReturnType<typeof vi.fn>).mockResolvedValue({ _sum: { grandTotal: 0 } });
  }

  it('warns with reference counts and blocks unless forced', async () => {
    const { svc, prisma } = buildService();
    stubBalanceCalls(prisma);
    (prisma.purchase?.count as ReturnType<typeof vi.fn>).mockResolvedValue(2);
    (prisma.purchaseReturn?.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);

    const body = await errorBody(svc.remove('s1', 'u1'));

    expect(body.code).toBe('REFERENCES_EXIST');
    expect(body.details).toEqual(['2 purchase invoices']);
    expect(prisma.supplier?.delete).not.toHaveBeenCalled();
  });

  it('cascades purchases and returns when forced', async () => {
    const { svc, prisma } = buildService();
    stubBalanceCalls(prisma);
    (prisma.purchase?.count as ReturnType<typeof vi.fn>).mockResolvedValue(2);
    (prisma.purchaseReturn?.count as ReturnType<typeof vi.fn>).mockResolvedValue(1);
    (prisma.purchaseReturn?.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 });
    (prisma.purchase?.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 2 });
    (prisma.supplier?.delete as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 's1' });

    const result = await svc.remove('s1', 'u1', true);

    expect(prisma.purchaseReturn?.deleteMany).toHaveBeenCalledWith({ where: { supplierId: 's1' } });
    expect(prisma.purchase?.deleteMany).toHaveBeenCalledWith({ where: { supplierId: 's1' } });
    expect(prisma.supplier?.delete).toHaveBeenCalledWith({ where: { id: 's1' } });
    expect(result).toEqual({ id: 's1', deleted: true });
  });

  it('deletes directly when there are no references', async () => {
    const { svc, prisma } = buildService();
    stubBalanceCalls(prisma);
    (prisma.purchase?.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    (prisma.purchaseReturn?.count as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    (prisma.supplier?.delete as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 's1' });

    const result = await svc.remove('s1', 'u1');

    expect(prisma.purchase?.deleteMany).not.toHaveBeenCalled();
    expect(prisma.purchaseReturn?.deleteMany).not.toHaveBeenCalled();
    expect(prisma.supplier?.delete).toHaveBeenCalledWith({ where: { id: 's1' } });
    expect(result).toEqual({ id: 's1', deleted: true });
  });
});