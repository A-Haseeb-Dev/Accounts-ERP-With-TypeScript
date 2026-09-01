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
    },
  ): Promise<number> {
    const balance =
      (await this.getBalance(input.itemId, input.locationId, tx)) + Number(input.quantity);

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
      },
    });
    return balance;
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
          select: { id: true, purchasePrice: true },
        })
      : [];

    const priceMap = new Map(items.map((i: any) => [i.id, Number(i.purchasePrice)]));
    let total = 0;
    for (const row of agg) {
      const rowAny = row as any;
      const qty =
        Number(rowAny._sum.quantityIn ?? 0) - Number(rowAny._sum.quantityOut ?? 0);
      total += qty * Number(priceMap.get(rowAny.itemId) ?? 0);
    }
    return { totalValue: total, items: itemIds.length };
  }
}