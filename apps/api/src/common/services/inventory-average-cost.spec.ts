import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InventoryService } from './inventory.service';

/**
 * A tx stub whose inventory ledger can be queried per location, so the average
 * cost maths is exercised against the real balance arithmetic rather than a
 * fixed number.
 */
function buildWorld(options?: { averageCost?: number; movements?: { locationId: string; inQty: number; outQty: number }[] }) {
  const movements = options?.movements ?? [];
  let averageCost = options?.averageCost ?? 0;
  const item: { id: string; averageCost: number } = { id: 'item-1', averageCost };

  const ledger = {
    aggregate: vi.fn(async ({ where }: { where: { itemId: string; locationId?: string } }) => {
      // A locationId in the where clause scopes the sum, matching Prisma.
      const scoped = where.locationId ? movements.filter((m) => m.locationId === where.locationId) : movements;
      return {
        _sum: {
          quantityIn: scoped.reduce((s, m) => s + m.inQty, 0),
          quantityOut: scoped.reduce((s, m) => s + m.outQty, 0),
        },
      };
    }),
    groupBy: vi.fn(async () =>
      movements.length
        ? [
            {
              itemId: 'item-1',
              _sum: {
                quantityIn: movements.reduce((s, m) => s + m.inQty, 0),
                quantityOut: movements.reduce((s, m) => s + m.outQty, 0),
              },
            },
          ]
        : [],
    ),
    create: vi.fn(async ({ data }: { data: { quantityIn: number; quantityOut: number; locationId: string } }) => {
      movements.push({
        locationId: data.locationId,
        inQty: Number(data.quantityIn),
        outQty: Number(data.quantityOut),
      });
      return {};
    }),
  };

  const tx = {
    inventoryTransaction: ledger,
    item: {
      findUnique: vi.fn(async () => ({ id: 'item-1', averageCost: item.averageCost })),
      update: vi.fn(async ({ data }: { data: { averageCost: number } }) => {
        item.averageCost = data.averageCost;
        return item;
      }),
      findMany: vi.fn(async () => [item]),
    },
  };

  const prisma = {
    inventoryTransaction: ledger,
    item: tx.item,
  };

  const svc = new InventoryService(prisma as never);
  return { svc, tx, item, ledger };
}

describe('InventoryService weighted-average cost', () => {
  beforeEach(() => vi.clearAllMocks());

  it('adopts the cost of the first delivery when nothing is held', async () => {
    const { svc, tx, item } = buildWorld();
    await svc.recordIn(tx as never, {
      itemId: 'item-1',
      locationId: 'loc-1',
      quantity: 10,
      transactionType: 'PURCHASE',
      unitCost: 25,
    });
    expect(item.averageCost).toBe(25);
  });

  it('re-averages when a further delivery arrives at a different cost', async () => {
    // 10 @ 25, then 30 @ 40  ->  (10*25 + 30*40) / 40 = 36.25
    const { svc, tx, item } = buildWorld({
      averageCost: 25,
      movements: [{ locationId: 'loc-1', inQty: 10, outQty: 0 }],
    });
    await svc.recordIn(tx as never, {
      itemId: 'item-1',
      locationId: 'loc-1',
      quantity: 30,
      transactionType: 'PURCHASE',
      unitCost: 40,
    });
    expect(item.averageCost).toBe(36.25);
  });

  it('spreads the average across every location, not just the receiving one', async () => {
    // 100 units already held item-wide at 20, 40 more arrive at 30 into loc-2
    // while loc-1 still holds the bulk: (100*20 + 40*30) / 140 = 22.857...
    const { svc, tx, item } = buildWorld({
      averageCost: 20,
      movements: [
        { locationId: 'loc-1', inQty: 60, outQty: 0 },
        { locationId: 'loc-2', inQty: 40, outQty: 0 },
      ],
    });
    await svc.recordIn(tx as never, {
      itemId: 'item-1',
      locationId: 'loc-2',
      quantity: 40,
      transactionType: 'PURCHASE',
      unitCost: 30,
    });
    expect(item.averageCost).toBeCloseTo(22.8571, 4);
  });

  it('is a no-op when goods come back at the cost they left at', async () => {
    // A sales return restocks at the current average, so the average must not move.
    const { svc, tx, item } = buildWorld({
      averageCost: 36.25,
      movements: [{ locationId: 'loc-1', inQty: 40, outQty: 0 }],
    });
    await svc.recordIn(tx as never, {
      itemId: 'item-1',
      locationId: 'loc-1',
      quantity: 5,
      transactionType: 'SALES_RETURN',
      unitCost: 36.25,
    });
    expect(item.averageCost).toBeCloseTo(36.25, 4);
  });

  it('leaves the average alone for an internal stock transfer', async () => {
    const { svc, tx, item } = buildWorld({
      averageCost: 36.25,
      movements: [{ locationId: 'loc-1', inQty: 40, outQty: 0 }],
    });
    await svc.recordIn(
      tx as never,
      { itemId: 'item-1', locationId: 'loc-2', quantity: 10, transactionType: 'TRANSFER_IN' },
      { affectsCosting: false },
    );
    expect(item.averageCost).toBe(36.25);
  });

  it('does not touch the average when a movement carries no cost at all', async () => {
    const { svc, tx, item } = buildWorld({
      averageCost: 12,
      movements: [{ locationId: 'loc-1', inQty: 5, outQty: 0 }],
    });
    await svc.recordIn(tx as never, {
      itemId: 'item-1',
      locationId: 'loc-1',
      quantity: 5,
      transactionType: 'TRANSFER_IN',
    });
    expect(item.averageCost).toBe(12);
  });

  it('adopts the incoming cost when the last unit is sold off and restocked', async () => {
    const { svc, tx, item } = buildWorld({
      averageCost: 36.25,
      movements: [{ locationId: 'loc-1', inQty: 0, outQty: 0 }],
    });
    await svc.recordIn(tx as never, {
      itemId: 'item-1',
      locationId: 'loc-1',
      quantity: 4,
      transactionType: 'PURCHASE',
      unitCost: 50,
    });
    expect(item.averageCost).toBe(50);
  });

  it('never re-averages on a quantity-out movement', async () => {
    const { svc, tx, item } = buildWorld({
      averageCost: 36.25,
      movements: [{ locationId: 'loc-1', inQty: 40, outQty: 0 }],
    });
    await svc.recordOut(tx as never, {
      itemId: 'item-1',
      locationId: 'loc-1',
      quantity: 10,
      transactionType: 'SALE',
      unitCost: 36.25,
    });
    expect(item.averageCost).toBe(36.25);
  });
});

describe('InventoryService.totalStockValue', () => {
  it('values stock at the weighted-average cost, not the latest purchase price', async () => {
    const { svc } = buildWorld({
      averageCost: 36.25,
      movements: [{ locationId: 'loc-1', inQty: 40, outQty: 0 }],
    });
    const result = await svc.totalStockValue();
    expect(result.totalValue).toBe(1450);
  });
});
