import { describe, it, expect, vi } from 'vitest';
import { InventoryService } from './inventory.service';

type MockFn = ReturnType<typeof vi.fn>;

interface MockInventoryPrisma {
  inventoryTransaction: { aggregate?: MockFn; groupBy?: MockFn; create?: MockFn };
  item?: { findMany?: MockFn };
}

function buildService(overrides?: { prisma?: Partial<MockInventoryPrisma> }) {
  const prisma: MockInventoryPrisma = {
    inventoryTransaction: {
      aggregate: vi.fn(),
      groupBy: vi.fn(),
      create: vi.fn(),
    },
    item: { findMany: vi.fn() },
    ...(overrides?.prisma ?? {}),
  } as MockInventoryPrisma;
  const svc = new InventoryService(prisma as never);
  return { svc, prisma };
}

function buildTx(prisma: MockInventoryPrisma) {
  return prisma as never;
}

describe('InventoryService.getBalance', () => {
  it('returns zero when no transactions exist', async () => {
    const { svc, prisma } = buildService();
    (prisma.inventoryTransaction.aggregate as ReturnType<typeof vi.fn>).mockResolvedValue({
      _sum: { quantityIn: null, quantityOut: null },
    });
    const balance = await svc.getBalance('item-1', 'loc-1');
    expect(balance).toBe(0);
  });

  it('computes quantityIn minus quantityOut', async () => {
    const { svc, prisma } = buildService();
    (prisma.inventoryTransaction.aggregate as ReturnType<typeof vi.fn>).mockResolvedValue({
      _sum: { quantityIn: 100, quantityOut: 30 },
    });
    const balance = await svc.getBalance('item-1', 'loc-1');
    expect(balance).toBe(70);
  });
});

describe('InventoryService.getBalanceMap', () => {
  it('returns a map with zero for items not in aggregate', async () => {
    const { svc, prisma } = buildService();
    (prisma.inventoryTransaction.groupBy as ReturnType<typeof vi.fn>).mockResolvedValue([
      { itemId: 'a', _sum: { quantityIn: 50, quantityOut: 10 } },
    ]);
    const map = await svc.getBalanceMap(['a', 'b'], 'loc-1');
    expect(map.get('a')).toBe(40);
    expect(map.get('b')).toBe(0);
  });

  it('returns correct balances for multiple items', async () => {
    const { svc, prisma } = buildService();
    (prisma.inventoryTransaction.groupBy as ReturnType<typeof vi.fn>).mockResolvedValue([
      { itemId: 'a', _sum: { quantityIn: 200, quantityOut: 50 } },
      { itemId: 'b', _sum: { quantityIn: 100, quantityOut: 100 } },
    ]);
    const map = await svc.getBalanceMap(['a', 'b', 'c'], 'loc-1');
    expect(map.get('a')).toBe(150);
    expect(map.get('b')).toBe(0);
    expect(map.get('c')).toBe(0);
  });
});

describe('InventoryService.recordIn', () => {
  it('creates a quantity-in transaction and returns new balance', async () => {
    const { prisma } = buildService();
    (prisma.inventoryTransaction.aggregate as ReturnType<typeof vi.fn>).mockResolvedValue({
      _sum: { quantityIn: 50, quantityOut: 20 },
    });
    (prisma.inventoryTransaction.create as ReturnType<typeof vi.fn>).mockResolvedValue({});
    const svc = new InventoryService({} as never);
    const tx = buildTx(prisma);

    const balance = await svc.recordIn(tx, {
      itemId: 'item-1',
      locationId: 'loc-1',
      quantity: 25,
      transactionType: 'PURCHASE',
      referenceType: 'Purchase',
      referenceId: 'p1',
      unitCost: 10,
      createdById: 'u1',
    });

    expect(balance).toBe(55);
    expect(prisma.inventoryTransaction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        itemId: 'item-1',
        locationId: 'loc-1',
        quantityIn: 25,
        quantityOut: 0,
        balance: 55,
        transactionType: 'PURCHASE',
      }),
    });
  });
});

describe('InventoryService.recordOut', () => {
  it('creates a quantity-out transaction when sufficient stock', async () => {
    const { prisma } = buildService();
    const aggregateMock = prisma.inventoryTransaction.aggregate as ReturnType<typeof vi.fn>;
    aggregateMock
      .mockResolvedValueOnce({ _sum: { quantityIn: 100, quantityOut: 30 } }) // getBalance check
      .mockResolvedValueOnce({ _sum: { quantityIn: 100, quantityOut: 30 } }); // second getBalance for balance calc
    (prisma.inventoryTransaction.create as ReturnType<typeof vi.fn>).mockResolvedValue({});
    const svc = new InventoryService({} as never);
    const tx = buildTx(prisma);

    const balance = await svc.recordOut(
      tx,
      {
        itemId: 'item-1',
        locationId: 'loc-1',
        quantity: 20,
        transactionType: 'SALE',
        referenceType: 'Sale',
        referenceId: 's1',
      },
      { allowNegative: false },
    );

    expect(balance).toBe(50);
  });

  it('throws when stock is insufficient', async () => {
    const { prisma } = buildService();
    (prisma.inventoryTransaction.aggregate as ReturnType<typeof vi.fn>).mockResolvedValue({
      _sum: { quantityIn: 5, quantityOut: 3 },
    });
    const svc = new InventoryService({} as never);
    const tx = buildTx(prisma);

    await expect(
      svc.recordOut(
        tx,
        {
          itemId: 'item-1',
          locationId: 'loc-1',
          quantity: 10,
          transactionType: 'SALE',
        },
        { allowNegative: false },
      ),
    ).rejects.toThrow('ERR_INSUFFICIENT_STOCK');
  });

  it('allows negative stock when opt is set', async () => {
    const { prisma } = buildService();
    const aggregateMock = prisma.inventoryTransaction.aggregate as ReturnType<typeof vi.fn>;
    aggregateMock
      .mockResolvedValueOnce({ _sum: { quantityIn: 5, quantityOut: 3 } })
      .mockResolvedValueOnce({ _sum: { quantityIn: 5, quantityOut: 3 } });
    (prisma.inventoryTransaction.create as ReturnType<typeof vi.fn>).mockResolvedValue({});
    const svc = new InventoryService({} as never);
    const tx = buildTx(prisma);

    const balance = await svc.recordOut(
      tx,
      {
        itemId: 'item-1',
        locationId: 'loc-1',
        quantity: 10,
        transactionType: 'SALE',
      },
      { allowNegative: true },
    );

    expect(balance).toBe(-8);
  });
});
