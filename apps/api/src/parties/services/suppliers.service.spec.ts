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

interface MockSuppliersPrisma {
  supplier?: { findUnique?: MockFn; create?: MockFn; findMany?: MockFn; count?: MockFn; update?: MockFn };
  town?: { findUnique?: MockFn };
  voucherEntry?: { findMany?: MockFn };
  purchase?: { aggregate?: MockFn };
  purchaseReturn?: { aggregate?: MockFn };
}

function buildService(overrides?: { prisma?: Partial<MockSuppliersPrisma> }) {
  const prisma: MockSuppliersPrisma = {
    supplier: {
      findUnique: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
    town: { findUnique: vi.fn() },
    voucherEntry: { findMany: vi.fn() },
    purchase: { aggregate: vi.fn() },
    purchaseReturn: { aggregate: vi.fn() },
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