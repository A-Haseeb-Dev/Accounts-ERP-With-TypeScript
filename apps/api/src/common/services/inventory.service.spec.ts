import { describe, it, expect, vi } from 'vitest';
import { InventoryService } from './inventory.service';

type MockFn = ReturnType<typeof vi.fn>;

interface MockInventoryPrisma {
  inventoryTransaction: { aggregate?: MockFn; groupBy?: MockFn; create?: MockFn; findMany?: MockFn; update?: MockFn };
  item?: { findMany?: MockFn; findUnique?: MockFn; update?: MockFn };
}

function buildService(overrides?: { prisma?: Partial<MockInventoryPrisma> }) {
  const prisma: MockInventoryPrisma = {
    inventoryTransaction: {
      aggregate: vi.fn(),
      groupBy: vi.fn(),
      create: vi.fn(),
      // Re-deriving balances and the average cost walks the stored movements.
      findMany: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
    item: {
      findMany: vi.fn(),
      // Weighted-average maintenance reads and writes the item's average cost
      // whenever a movement carries a cost.
      findUnique: vi.fn().mockResolvedValue({ id: 'item-1', averageCost: 0 }),
      update: vi.fn().mockResolvedValue({}),
    },
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

describe('InventoryService.recomputeBalances', () => {
  it('re-derives every stored balance after an earlier movement changes', async () => {
    const { svc, prisma } = buildService();
    // Opening 10, then a sale of 3: the sale row still carries balance 7, the
    // figure it was given when the opening was 10.
    (prisma.inventoryTransaction.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'r1', quantityIn: 20, quantityOut: 0, balance: 10 },
      { id: 'r2', quantityIn: 0, quantityOut: 3, balance: 7 },
    ]);
    const update = prisma.inventoryTransaction.update as ReturnType<typeof vi.fn>;
    update.mockResolvedValue({});

    await svc.recomputeBalances(prisma as never, 'item-1', 'loc-1');

    expect(update).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenNthCalledWith(1, { where: { id: 'r1' }, data: { balance: 20 } });
    expect(update).toHaveBeenNthCalledWith(2, { where: { id: 'r2' }, data: { balance: 17 } });
  });

  it('leaves rows alone when the running balance already agrees', async () => {
    const { svc, prisma } = buildService();
    (prisma.inventoryTransaction.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'r1', quantityIn: 5, quantityOut: 0, balance: 5 },
    ]);
    const update = prisma.inventoryTransaction.update as ReturnType<typeof vi.fn>;

    await svc.recomputeBalances(prisma as never, 'item-1', 'loc-1');

    expect(update).not.toHaveBeenCalled();
  });
});

describe('InventoryService.recomputeAverageCost', () => {
  it('rebuilds the weighted average across the whole history', async () => {
    const { svc, prisma } = buildService();
    // Opening 10 @ 5, then 10 @ 8 -> (50 + 80) / 20 = 6.5
    (prisma.inventoryTransaction.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { quantityIn: 10, quantityOut: 0, unitCost: 5 },
      { quantityIn: 10, quantityOut: 0, unitCost: 8 },
    ]);

    await svc.recomputeAverageCost(prisma as never, 'item-1');

    expect(prisma.item!.update).toHaveBeenCalledWith({ where: { id: 'item-1' }, data: { averageCost: 6.5 } });
  });

  it('does not let a transfer move the average', async () => {
    const { svc, prisma } = buildService();
    // A transfer in is the same goods in another place: no unit cost, so the
    // average stays where the purchase left it.
    (prisma.inventoryTransaction.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { quantityIn: 10, quantityOut: 0, unitCost: 5 },
      { quantityIn: 10, quantityOut: 0, unitCost: null },
    ]);

    await svc.recomputeAverageCost(prisma as never, 'item-1');

    expect(prisma.item!.update).toHaveBeenCalledWith({ where: { id: 'item-1' }, data: { averageCost: 5 } });
  });

  it('resets to zero when nothing is held or costed', async () => {
    const { svc, prisma } = buildService();
    (prisma.inventoryTransaction.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    await svc.recomputeAverageCost(prisma as never, 'item-1');

    expect(prisma.item!.update).toHaveBeenCalledWith({ where: { id: 'item-1' }, data: { averageCost: 0 } });
  });
});
