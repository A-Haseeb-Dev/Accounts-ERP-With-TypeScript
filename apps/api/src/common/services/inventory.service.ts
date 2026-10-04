import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Inventory engine - records every movement in the inventory transaction
 * ledger and computes running balances per item+location.
 */
@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Reads current available quantity for an item at a location.
   */
  async getBalance(itemId: string, locationId: string, tx?: any): Promise<number> {
    const client = tx ?? this.prisma;
    const agg = await client.inventoryTransaction.aggregate({
      where: { itemId, locationId },
      _sum: { quantityIn: true, quantityOut: true },
    });
    return Number(agg._sum.quantityIn ?? 0) - Number(agg._sum.quantityOut ?? 0);
  }

  /**
   * Total quantity of an item on hand across every location. Cost is a
   * property of the item rather than of a location, so valuation uses this.
   */
  async totalOnHand(itemId: string, tx?: any): Promise<number> {
    const client = tx ?? this.prisma;
    const agg = await client.inventoryTransaction.aggregate({
      where: { itemId },
      _sum: { quantityIn: true, quantityOut: true },
    });
    return Number(agg._sum.quantityIn ?? 0) - Number(agg._sum.quantityOut ?? 0);
  }

  async getBalanceMap(
    itemIds: string[],
    locationId: string,
    tx?: any,
  ): Promise<Map<string, number>> {
    const client = tx ?? this.prisma;
    const agg = await client.inventoryTransaction.groupBy({
      by: ['itemId'],
      where: { itemId: { in: itemIds }, locationId },
      _sum: { quantityIn: true, quantityOut: true },
    });
    const map = new Map<string, number>();
    for (const row of agg) {
      map.set(row.itemId, Number(row._sum.quantityIn ?? 0) - Number(row._sum.quantityOut ?? 0));
    }
    for (const id of itemIds) {
      if (!map.has(id)) map.set(id, 0);
    }
    return map;
  }

  /**
   * Records a quantity-in movement and returns the resulting balance.
   *
   * When the movement carries a unit cost, the item's running weighted-average
   * cost is recalculated so that `averageCost` always reflects the units
   * actually on hand. Movements without a cost (an internal stock transfer,
   * which is the same goods changing location) must not move the average, and
   * pass `affectsCosting: false` to make that explicit.
   *
   * `date` backdates the movement. It exists for opening stock, which by
   * definition happened before the company started using the system; every
   * other movement is stamped when it is posted.
   */
  async recordIn(
    tx: any,
    input: {
      itemId: string;
      locationId: string;
      quantity: number;
      transactionType: string;
      referenceType?: string;
      referenceId?: string;
      unitCost?: number;
      createdById?: string;
      date?: Date | string | null;
    },
    opts: { affectsCosting?: boolean } = {},
  ): Promise<number> {
    const before = await this.getBalance(input.itemId, input.locationId, tx);
    const balance = before + Number(input.quantity);
    // Captured before the insert so the average is spread over the units that
    // were already held, not over the incoming ones as well.
    const onHandBefore = await this.totalOnHand(input.itemId, tx);

    await tx.inventoryTransaction.create({
      data: {
        itemId: input.itemId,
        locationId: input.locationId,
        transactionType: input.transactionType,
        referenceType: input.referenceType ?? null,
        referenceId: input.referenceId ?? null,
        quantityIn: Number(input.quantity),
        quantityOut: 0,
        balance,
        unitCost: input.unitCost ?? null,
        createdById: input.createdById ?? null,
        ...(input.date ? { createdAt: new Date(input.date) } : {}),
      },
    });

    const affectsCosting = opts.affectsCosting ?? input.unitCost != null;
    if (affectsCosting && input.unitCost != null) {
      await this.updateAverageCost(tx, input.itemId, onHandBefore, Number(input.quantity), input.unitCost);
    }
    return balance;
  }

  /**
   * Recalculates an item's weighted-average cost after a quantity-in movement.
   *
   * The value on hand (quantity x average) is spread across all the units
   * already held, then diluted by whatever has just come in. Called with the
   * cost that is already the average - a sales return putting goods back - it
   * resolves to the same figure, which is the intended no-op.
   */
  private async updateAverageCost(
    tx: any,
    itemId: string,
    onHandBefore: number,
    quantityIn: number,
    unitCost: number,
  ): Promise<void> {
    const item = await tx.item.findUnique({ where: { id: itemId }, select: { averageCost: true } });
    const current = Number(item?.averageCost ?? 0);
    const onHandAfter = onHandBefore + quantityIn;

    // Nothing left to spread the cost over: adopt the incoming cost so the next
    // movement starts from something meaningful.
    const next =
      onHandAfter <= 0 ? unitCost : (current * onHandBefore + unitCost * quantityIn) / onHandAfter;

    await tx.item.update({ where: { id: itemId }, data: { averageCost: round4(next) } });
  }

  /**
   * Records a quantity-out movement and returns the resulting balance.
   * Optionally validates that sufficient stock exists (negative inventory).
   */
  async recordOut(
    tx: any,
    input: {
      itemId: string;
      locationId: string;
      quantity: number;
      transactionType: string;
      referenceType?: string;
      referenceId?: string;
      unitCost?: number;
      createdById?: string;
    },
    opts: { allowNegative?: boolean } = { allowNegative: false },
  ): Promise<number> {
    if (!opts.allowNegative) {
      const current = await this.getBalance(input.itemId, input.locationId, tx);
      if (current < Number(input.quantity)) {
        throw new Error(
          `ERR_INSUFFICIENT_STOCK:${input.itemId}`,
        );
      }
    }

    const balance =
      (await this.getBalance(input.itemId, input.locationId, tx)) - Number(input.quantity);

    await tx.inventoryTransaction.create({
      data: {
        itemId: input.itemId,
        locationId: input.locationId,
        transactionType: input.transactionType,
        referenceType: input.referenceType ?? null,
        referenceId: input.referenceId ?? null,
        quantityIn: 0,
        quantityOut: Number(input.quantity),
        balance,
        unitCost: input.unitCost ?? null,
        createdById: input.createdById ?? null,
      },
    });
    return balance;
  }

  /**
   * Current stock value for all items (at any location) using purchase price.
   */
  async totalStockValue(tx?: any): Promise<{ totalValue: number; items: number }> {
    const client: any = tx ?? this.prisma;
    const agg = await client.inventoryTransaction.groupBy({
      by: ['itemId'],
      _sum: { quantityIn: true, quantityOut: true },
    });
    const itemIds = agg.map((r: any) => r.itemId);
    const items = itemIds.length
      ? await client.item.findMany({
          where: { id: { in: itemIds } },
          select: { id: true, averageCost: true },
        })
      : [];

    // Valued at the weighted-average cost, so the figure agrees with the cost of
    // goods sold that was posted to the ledger.
    const costMap = new Map(items.map((i: any) => [i.id, Number(i.averageCost ?? 0)]));
    let total = 0;
    for (const row of agg) {
      const rowAny = row as any;
      const qty =
        Number(rowAny._sum.quantityIn ?? 0) - Number(rowAny._sum.quantityOut ?? 0);
      total += qty * Number(costMap.get(rowAny.itemId) ?? 0);
    }
    return { totalValue: total, items: itemIds.length };
  }

  /**
   * Rewrites the stored running `balance` of every movement for one item at one
   * location, in movement order.
   *
   * Each movement stores the balance it left behind, which is what the item
   * ledger prints. That makes the column a cache of the sequence rather than a
   * fact of its own, so anything that changes an earlier movement - which
   * opening stock does, by definition - invalidates every row after it. Callers
   * re-derive instead of adjusting the single row they touched.
   */
  async recomputeBalances(tx: any, itemId: string, locationId: string): Promise<void> {
    const rows = await tx.inventoryTransaction.findMany({
      where: { itemId, locationId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { id: true, quantityIn: true, quantityOut: true, balance: true },
    });

    let running = 0;
    for (const row of rows) {
      running += Number(row.quantityIn ?? 0) - Number(row.quantityOut ?? 0);
      if (Number(row.balance) !== running) {
        await tx.inventoryTransaction.update({ where: { id: row.id }, data: { balance: running } });
      }
    }
  }

  /**
   * Rebuilds an item's weighted-average cost from its whole movement history.
   *
   * `updateAverageCost` folds one new movement into the running figure, which is
   * all a normal purchase needs. Changing opening stock is not normal: it is the
   * first movement, so every average after it was computed from a figure that no
   * longer exists and has to be derived again from the start.
   *
   * Follows the same rules as the incremental path - a quantity-in with a cost
   * moves the average, one without a cost (a transfer, the same goods in another
   * place) does not, and a quantity-out only reduces the units held.
   */
  async recomputeAverageCost(tx: any, itemId: string): Promise<void> {
    const rows = await tx.inventoryTransaction.findMany({
      where: { itemId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { quantityIn: true, quantityOut: true, unitCost: true },
    });

    let onHand = 0;
    let average = 0;
    for (const row of rows) {
      const qtyIn = Number(row.quantityIn ?? 0);
      if (qtyIn > 0) {
        const unitCost = row.unitCost == null ? null : Number(row.unitCost);
        if (unitCost != null) {
          const after = onHand + qtyIn;
          average = after <= 0 ? unitCost : (average * onHand + unitCost * qtyIn) / after;
        }
        onHand += qtyIn;
      }
      onHand -= Number(row.quantityOut ?? 0);
    }

    await tx.item.update({ where: { id: itemId }, data: { averageCost: round4(average) } });
  }
}

/** Averages are stored to 4dp so repeated movements do not drift. */
function round4(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 10000) / 10000;
}