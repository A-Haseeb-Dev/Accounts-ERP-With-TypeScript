import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ItemsService } from './items.service';

/** The message lives in the response body, not on the Error. */
async function messageOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (err) {
    const e = err as { getResponse?: () => unknown };
    const resp = (e.getResponse?.() ?? {}) as { error?: { message?: string } };
    return resp.error?.message ?? '';
  }
  throw new Error('expected the call to reject');
}

/**
 * Opening stock has to survive the round trip through the item form, and every
 * stock figure in the app is a sum of movements rather than a column. These
 * tests pin that relationship, because the failure mode is quiet: the form
 * shows the number the user typed while the stock report reads something else.
 */
function build() {
  const prisma = {
    item: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    inventoryTransaction: {
      aggregate: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    systemSetting: { findFirst: vi.fn() },
    $transaction: vi.fn(),
    runInTransaction: vi.fn(),
  };

  const audit = { record: vi.fn() };
  const numbering = {
    next: vi.fn().mockResolvedValue('ITM-0001'),
    preview: vi.fn().mockReturnValue('ITM-0001'),
  };
  const inventory = {
    recordIn: vi.fn().mockResolvedValue(100),
    recomputeBalances: vi.fn(),
    recomputeAverageCost: vi.fn(),
  };
  const accounting = { syncOpeningStockVoucher: vi.fn().mockResolvedValue({ posted: true }) };

  const svc = new ItemsService(
    prisma as never,
    audit as never,
    numbering as never,
    inventory as never,
    accounting as never,
  );
  return { svc, prisma, audit, numbering, inventory, accounting };
}

const itemRow = {
  id: 'item-1',
  code: 'ITM-0001',
  name: 'Cotton Fabric',
  unit: 'm',
  openingQuantity: 100,
  openingUnitCost: 250,
  openingDate: new Date('2026-01-01T00:00:00.000Z'),
  defaultLocationId: 'loc-1',
};

describe('ItemsService opening stock', () => {
  let b: ReturnType<typeof build>;
  // `syncOpeningStock` re-reads the item after the write, the way the real
  // service does, so the mock has to carry the update through.
  let row: Record<string, unknown>;
  // Whether the code under test is inside the transaction. Set by the
  // transaction mock, read by the write mocks, so a test can tell "written in
  // the same transaction" from "written next to one" - which is the whole
  // difference between an item that rolls back and one that does not.
  let insideTx = false;
  beforeEach(() => {
    b = build();
    row = { ...itemRow };
    insideTx = false;
    b.prisma.runInTransaction.mockImplementation((fn: (t: unknown) => unknown) => {
      insideTx = true;
      return fn(b.prisma);
    });
    // `create` looks the code up to reject duplicates; that lookup has to miss.
    b.prisma.item.findUnique.mockImplementation(async (args: never) => {
      const where = (args as { where?: { code?: string; id?: string } }).where ?? {};
      if (where.code !== undefined) return null;
      return row;
    });
    b.prisma.item.findMany.mockResolvedValue([]);
    // `findOne` sums movements for the current stock it returns alongside.
    b.prisma.inventoryTransaction.aggregate.mockResolvedValue({
      _sum: { quantityIn: 100, quantityOut: 0 },
    });
    b.prisma.item.create.mockImplementation(async ({ data }: never) => {
      row = { ...(data as object), id: 'item-1' };
      return row;
    });
    b.prisma.item.update.mockImplementation(async ({ data }: never) => {
      row = { ...row, ...(data as object) };
      return row;
    });
    b.prisma.inventoryTransaction.findFirst.mockResolvedValue(null);
    b.prisma.inventoryTransaction.update.mockResolvedValue({});
    b.prisma.inventoryTransaction.deleteMany.mockResolvedValue({ count: 1 });
  });

  it('records a new opening as a movement so stock totals include it', async () => {
    await b.svc.create({
      name: 'Cotton Fabric',
      unit: 'm',
      defaultLocationId: 'loc-1',
      openingQuantity: 100,
      openingUnitCost: 250,
      openingDate: '2026-01-01',
    } as never);

    expect(b.inventory.recordIn).toHaveBeenCalledTimes(1);
    const call = b.inventory.recordIn.mock.calls[0][1] as Record<string, unknown>;
    expect(call).toMatchObject({
      itemId: 'item-1',
      locationId: 'loc-1',
      quantity: 100,
      transactionType: 'OPENING',
      referenceType: 'OPENING_STOCK',
      unitCost: 250,
    });
    // Backdated, so the item ledger's date filter shows the stock as at the
    // opening date instead of at the moment the item was created.
    expect((call.date as Date).toISOString()).toContain('2026-01-01');
  });

  it('creates the item and its opening movement in one transaction', async () => {
    let createSawTx = false;
    b.prisma.item.create.mockImplementation(async ({ data }: never) => {
      createSawTx = insideTx;
      row = { ...(data as object), id: 'item-1' };
      return row;
    });

    await b.svc.create({
      name: 'Cotton Fabric',
      unit: 'm',
      defaultLocationId: 'loc-1',
      openingQuantity: 100,
      openingUnitCost: 250,
    } as never);

    expect(createSawTx).toBe(true);
    expect(b.inventory.recordIn.mock.calls[0][0]).toBe(b.prisma);
    // One transaction for both writes, not one for the item and one for the
    // movement: if the movement fails, the item must not survive on its own.
    expect(b.prisma.runInTransaction).toHaveBeenCalledTimes(1);
  });

  it('refuses opening stock with nowhere to hold it', async () => {
    const message = await messageOf(
      b.svc.create({ name: 'Cotton Fabric', openingQuantity: 50 } as never),
    );
    expect(message).toMatch(/default stock location/i);
    expect(b.inventory.recordIn).not.toHaveBeenCalled();
  });

  it('seeds the average cost from the opening unit cost', async () => {
    await b.svc.create({
      name: 'Cotton Fabric',
      defaultLocationId: 'loc-1',
      openingQuantity: 100,
      openingUnitCost: 250,
    } as never);

    expect(b.inventory.recomputeAverageCost).toHaveBeenCalled();
  });

  it('re-derives balances when an existing opening is corrected', async () => {
    b.prisma.inventoryTransaction.findFirst.mockResolvedValue({
      id: 'mv-1',
      locationId: 'loc-1',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    await b.svc.update('item-1', { openingQuantity: 120 } as never);

    // Corrected in place, not appended: two opening rows would double-count.
    expect(b.inventory.recordIn).not.toHaveBeenCalled();
    expect(b.prisma.inventoryTransaction.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'mv-1' }, data: expect.objectContaining({ quantityIn: 120 }) }),
    );
    // The opening is the earliest movement, so everything after it is stale.
    expect(b.inventory.recomputeBalances).toHaveBeenCalledWith(b.prisma, 'item-1', 'loc-1');
    expect(b.inventory.recomputeAverageCost).toHaveBeenCalled();
  });

  it('clears the movement and the voucher when the opening is zeroed', async () => {
    b.prisma.inventoryTransaction.findFirst.mockResolvedValue({
      id: 'open-1',
      itemId: 'item-1',
      locationId: 'loc-1',
      referenceType: 'OPENING_STOCK',
    });

    await b.svc.update('item-1', { openingQuantity: 0, openingUnitCost: 0 } as never);

    expect(b.prisma.inventoryTransaction.deleteMany).toHaveBeenCalledWith({
      where: { itemId: 'item-1', referenceType: 'OPENING_STOCK' },
    });
    expect(b.accounting.syncOpeningStockVoucher).toHaveBeenCalledWith(
      'item-1', 0, undefined, itemRow.openingDate,
    );
  });

  it('re-derives balances and average cost when an opening is zeroed', async () => {
    // Rows after the opening were costed and balanced against it, so deleting
    // only the opening would leave them claiming stock that is gone.
    b.prisma.inventoryTransaction.findFirst.mockResolvedValue({
      id: 'open-1',
      itemId: 'item-1',
      locationId: 'loc-1',
      referenceType: 'OPENING_STOCK',
    });

    await b.svc.update('item-1', { openingQuantity: 0, openingUnitCost: 0 } as never);

    expect(b.inventory.recomputeBalances).toHaveBeenCalledWith(
      b.prisma, 'item-1', 'loc-1',
    );
    expect(b.inventory.recomputeAverageCost).toHaveBeenCalledWith(b.prisma, 'item-1');
    // Vouchers are cancelled rather than deleted, so no ledger value is left.
    expect(b.prisma.inventoryTransaction.update).not.toHaveBeenCalled();
  });

  it('leaves stock alone when the opening was not edited', async () => {
    await b.svc.update('item-1', { salePrice: 300 } as never);

    expect(b.inventory.recordIn).not.toHaveBeenCalled();
    expect(b.inventory.recomputeBalances).not.toHaveBeenCalled();
    expect(b.accounting.syncOpeningStockVoucher).not.toHaveBeenCalled();
  });

  it('warns instead of failing when no inventory account is bound', async () => {
    b.accounting.syncOpeningStockVoucher.mockResolvedValue({
      posted: false,
      reason: 'NO_INVENTORY_ACCOUNT',
    });

    const result = await b.svc.create({
      name: 'Cotton Fabric',
      defaultLocationId: 'loc-1',
      openingQuantity: 100,
      openingUnitCost: 250,
    } as never) as { warning?: string };

    expect(result.warning).toMatch(/Inventory account/i);
  });

  it('warns instead of failing when no opening equity account is bound', async () => {
    b.accounting.syncOpeningStockVoucher.mockResolvedValue({
      posted: false,
      reason: 'NO_EQUITY_ACCOUNT',
    });

    const result = await b.svc.create({
      name: 'Cotton Fabric',
      defaultLocationId: 'loc-1',
      openingQuantity: 100,
      openingUnitCost: 250,
    } as never) as { warning?: string };

    expect(result.warning).toMatch(/Opening Equity/i);
  });

  it('records the opening in the audit trail', async () => {
    await b.svc.create({
      name: 'Cotton Fabric',
      defaultLocationId: 'loc-1',
      openingQuantity: 100,
      openingUnitCost: 250,
      openingDate: '2026-01-01',
    } as never);

    expect(b.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ openingQuantity: 100 }) }),
    );
  });
});