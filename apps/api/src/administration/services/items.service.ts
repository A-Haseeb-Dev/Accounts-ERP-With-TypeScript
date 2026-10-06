import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { ApiException } from '../../common/exceptions/api.exception';
import { NumberingService } from '../../common/services/numbering.service';
import { InventoryService } from '../../common/services/inventory.service';
import { AccountingService } from '../../common/services/accounting.service';
import { CreateItemDto, UpdateItemDto } from '../dto/products.dto';
import { dateRange } from '../../common/utils/date-filter';

/**
 * How the opening movement is recognised on an inventory transaction. Kept as a
 * constant so the write in `syncOpeningStock` and the cleanup that zeroes an
 * opening cannot drift apart.
 */
const OPENING_REFERENCE = 'OPENING_STOCK';

@Injectable()
export class ItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly numbering: NumberingService,
    private readonly inventory: InventoryService,
    private readonly accounting: AccountingService,
  ) {}

  previewCode() {
    return this.numbering.preview('item', 'ITM', 4, { year: false });
  }

  async create(dto: CreateItemDto, actorId?: string) {
    const requestedCode = dto.code?.trim();
    const code = requestedCode || (await this.numbering.next('item', 'ITM', undefined, 4, { year: false }));
    const existing = await this.prisma.item.findUnique({ where: { code } });
    if (existing) throw ApiException.duplicateCode('Item code');
    if (dto.barcode) {
      const byBarcode = await this.prisma.item.findUnique({ where: { barcode: dto.barcode } });
      if (byBarcode) throw ApiException.duplicateCode('Barcode');
    }

    const openingQuantity = dto.openingQuantity ?? 0;
    if (openingQuantity !== 0 && !dto.defaultLocationId) {
      throw ApiException.invalidTransaction(
        'Set a default stock location first: opening stock has to be held somewhere.',
      );
    }

    const { item, warning } = await this.prisma.runInTransaction(async (tx) => {
      const created = await tx.item.create({
        data: {
          code,
          barcode: dto.barcode ?? null,
          name: dto.name,
          unit: dto.unit ?? 'pcs',
          purchasePrice: dto.purchasePrice ?? 0,
          salePrice: dto.salePrice ?? 0,
          minStockLevel: dto.minStockLevel ?? 0,
          openingQuantity,
          openingUnitCost: dto.openingUnitCost ?? null,
          openingDate: dto.openingDate ? new Date(dto.openingDate) : null,
          description: dto.description ?? null,
          itemTypeId: dto.itemTypeId ?? null,
          brandId: dto.brandId ?? null,
          defaultLocationId: dto.defaultLocationId ?? null,
          status: dto.status ?? 'active',
        },
        include: { itemType: true, brand: true, defaultLocation: true },
      });

      // Same transaction: an item that exists without its opening movement
      // would report the stock the form accepted and show nothing at all.
      const warn = await this.syncOpeningStock(created.id, actorId, tx);
      return { item: created, warning: warn };
    });

    this.audit.record({
      userId: actorId, action: 'CREATE', module: 'ITEM', entity: 'Item',
      entityId: item.id, message: `Item ${item.name} (${item.code}) created`,
      ...(openingQuantity !== 0
        ? { metadata: { openingQuantity: Number(openingQuantity), openingDate: item.openingDate } }
        : {}),
    });

    return { ...item, warning };
  }

  async findAll(query: {
    page?: number; pageSize?: number; search?: string; status?: string;
    itemTypeId?: string; brandId?: string;
  }) {
    const { page = 1, pageSize = 25, search, status, itemTypeId, brandId } = query;
    const where: Record<string, unknown> = {};
    if (search) {
      where.OR = [
        { code: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
        { barcode: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (status) where.status = status;
    if (itemTypeId) where.itemTypeId = itemTypeId;
    if (brandId) where.brandId = brandId;

    const items = await this.prisma.item.findMany({
      where,
      include: {
        itemType: true,
        brand: true,
        defaultLocation: true,
      },
      orderBy: { code: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    const total = await this.prisma.item.count({ where });

    const itemIds = items.map((i) => i.id);
    const stockAgg = await this.prisma.inventoryTransaction.groupBy({
      by: ['itemId'],
      where: { itemId: { in: itemIds } },
      _sum: { quantityIn: true, quantityOut: true },
    });

    const stockMap = new Map(stockAgg.map((s) => [s.itemId, s._sum]));

    const enriched = items.map((item) => {
      const sums = stockMap.get(item.id);
      const totalIn = Number(sums?.quantityIn ?? 0);
      const totalOut = Number(sums?.quantityOut ?? 0);
      const currentStock = totalIn - totalOut;
      return {
        ...item,
        currentStock,
        stockValue: currentStock * Number(item.purchasePrice),
        minStock: Number(item.minStockLevel),
      };
    });

    return { items: enriched, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async searchItems(query: { search?: string; limit?: number }) {
    const { search = '', limit = 10 } = query;
    const items = await this.prisma.item.findMany({
      where: {
        status: 'active',
        OR: [
          { code: { contains: search, mode: 'insensitive' } },
          { name: { contains: search, mode: 'insensitive' } },
          { barcode: { contains: search, mode: 'insensitive' } },
        ],
      },
      include: { defaultLocation: true },
      orderBy: { name: 'asc' },
      take: Math.min(limit, 50),
    });

    return Promise.all(
      items.map(async (item) => {
        const transactions = await this.prisma.inventoryTransaction.aggregate({
          where: { itemId: item.id },
          _sum: { quantityIn: true, quantityOut: true },
        });
        const stock = Number(transactions._sum.quantityIn ?? 0) - Number(transactions._sum.quantityOut ?? 0);
        return { ...item, currentStock: stock };
      }),
    );
  }

  async findOne(id: string) {
    const item = await this.prisma.item.findUnique({
      where: { id },
      include: { itemType: true, brand: true, defaultLocation: true },
    });
    if (!item) throw ApiException.notFound('Item');

    const transactions = await this.prisma.inventoryTransaction.aggregate({
      where: { itemId: id },
      _sum: { quantityIn: true, quantityOut: true },
    });
    const currentStock = Number(transactions._sum.quantityIn ?? 0) - Number(transactions._sum.quantityOut ?? 0);

    return { ...item, currentStock, stockValue: currentStock * Number(item.purchasePrice) };
  }

  async findStockByLocation(id: string) {
    const item = await this.prisma.item.findUnique({ where: { id } });
    if (!item) throw ApiException.notFound('Item');

    const locations = await this.prisma.stockLocation.findMany({ where: { status: 'active' } });
    const result = [];
    for (const loc of locations) {
      const agg = await this.prisma.inventoryTransaction.aggregate({
        where: { itemId: id, locationId: loc.id },
        _sum: { quantityIn: true, quantityOut: true },
      });
      result.push({
        location: loc,
        stock: Number(agg._sum.quantityIn ?? 0) - Number(agg._sum.quantityOut ?? 0),
      });
    }
    return result;
  }

  async findLedger(id: string, query: { page?: number; pageSize?: number; from?: string; to?: string }) {
    const item = await this.prisma.item.findUnique({ where: { id } });
    if (!item) throw ApiException.notFound('Item');

    const { page = 1, pageSize = 25, from, to } = query;
    const where: Record<string, unknown> = { itemId: id };
    if (from || to) {
      where.createdAt = dateRange(from, to);
    }

    const transactions = await this.prisma.inventoryTransaction.findMany({
      where,
      include: { location: true },
      orderBy: { createdAt: 'asc' },
    });

    const filtered = pageSize > 0 ? transactions.slice((page - 1) * pageSize, page * pageSize) : transactions;

    return {
      item,
      total: transactions.length,
      page,
      pageSize,
      totalPages: Math.ceil(transactions.length / pageSize),
      entries: filtered,
    };
  }

  async update(id: string, dto: UpdateItemDto, actorId?: string) {
    const before = await this.findOne(id);
    if (dto.code) {
      const byCode = await this.prisma.item.findUnique({ where: { code: dto.code } });
      if (byCode && byCode.id !== id) throw ApiException.duplicateCode('Item code');
    }

    const openingTouched =
      dto.openingQuantity !== undefined ||
      dto.openingUnitCost !== undefined ||
      dto.openingDate !== undefined;
    const openingQuantity = dto.openingQuantity ?? Number(before.openingQuantity ?? 0);
    if (openingQuantity !== 0 && !(dto.defaultLocationId ?? before.defaultLocationId)) {
      throw ApiException.invalidTransaction(
        'Set a default stock location first: opening stock has to be held somewhere.',
      );
    }

    const { item, warning } = await this.prisma.runInTransaction(async (tx) => {
      const updated = await tx.item.update({
        where: { id },
        data: {
          ...dto,
          ...(dto.openingDate !== undefined
            ? { openingDate: dto.openingDate ? new Date(dto.openingDate) : null }
            : {}),
        },
      });

      const warn =
        openingTouched || dto.defaultLocationId !== undefined
          ? await this.syncOpeningStock(id, actorId, tx)
          : null;
      return { item: updated, warning: warn };
    });

    this.audit.record({
      userId: actorId, action: 'UPDATE', module: 'ITEM', entity: 'Item',
      entityId: id, message: `Item ${item.name} updated`,
      metadata: { fields: Object.keys(dto), ...(openingTouched ? { openingChanged: true } : {}) },
    });
    return { ...item, warning };
  }

  /**
   * Brings the `OPENING` movement in line with the item's opening columns.
   *
   * The columns are what a user edits; this is the movement the rest of the
   * system reads, because every stock figure is a sum of movements. They are
   * written together in one transaction so the two cannot disagree.
   *
   * The voucher is the exception and stays outside it. It has its own
   * transaction, and a missing account downgrades to a warning rather than
   * throwing - letting that rollback a correctly recorded stock movement would
   * trade a real quantity for a bookkeeping entry the user can redo.
   *
   * Changing the opening is not a normal edit. It is by definition the earliest
   * movement for the item, so every balance recorded after it and every average
   * cost derived from it are now stale - hence the re-derivation rather than an
   * adjustment to the one row that moved. The voucher is cancelled and replaced
   * for the same reason: a posted voucher is a ledger fact, not a field.
   *
   * A missing Inventory or Opening Equity account is reported instead of thrown.
   * The stock has genuinely been recorded, and refusing to save an item over a
   * settings gap would lose that; the caller surfaces it as a warning.
   */
  private async syncOpeningStock(
    itemId: string,
    actorId?: string,
    outerTx?: any,
  ): Promise<string | null> {
    // When the caller already holds a transaction the movement joins it, and
    // the re-read has to go through the same connection: outside one it would
    // not see the item write that is still uncommitted.
    const db = outerTx ?? this.prisma;
    const run = <T>(fn: (tx: any) => Promise<T>): Promise<T> =>
      outerTx ? fn(outerTx) : this.prisma.runInTransaction(fn);

    const item = await db.item.findUnique({
      where: { id: itemId },
      select: {
        id: true, code: true, name: true, unit: true,
        openingQuantity: true, openingUnitCost: true, openingDate: true,
        defaultLocationId: true,
      },
    });
    if (!item) return null;

    const locationId = item.defaultLocationId;
    const quantity = Number(item.openingQuantity ?? 0);
    const unitCost = item.openingUnitCost == null ? null : Number(item.openingUnitCost);

    if (quantity === 0 && !unitCost) {
      // Nothing to hold and nothing to value: drop the movement and voucher a
      // previous opening left behind, so zeroing the field really does zero it.
      //
      // The rows that came after it were balanced and costed against it, so
      // deleting only the opening would leave them still claiming stock and
      // value that no longer exists. Same reasoning as an edit, and the same
      // remedy: re-derive them rather than leave the caches of a sequence that
      // has since been rewritten.
      await run(async (tx) => {
        const existing = await tx.inventoryTransaction.findFirst({
          where: { itemId, referenceType: OPENING_REFERENCE },
          orderBy: { createdAt: 'asc' },
        });
        await tx.inventoryTransaction.deleteMany({
          where: { itemId, referenceType: OPENING_REFERENCE },
        });
        if (existing?.locationId) {
          await this.inventory.recomputeBalances(tx, itemId, existing.locationId);
        }
        await this.inventory.recomputeAverageCost(tx, itemId);
      });
      await this.accounting.syncOpeningStockVoucher(itemId, 0, actorId, item.openingDate);
      return null;
    }

    if (!locationId) return null;

    const warning = await run(async (tx) => {
      const existing = await tx.inventoryTransaction.findFirst({
        where: { itemId, referenceType: OPENING_REFERENCE },
        orderBy: { createdAt: 'asc' },
      });

      if (existing) {
        await tx.inventoryTransaction.update({
          where: { id: existing.id },
          data: {
            locationId,
            quantityIn: quantity,
            quantityOut: 0,
            unitCost,
            ...(item.openingDate ? { createdAt: new Date(item.openingDate) } : {}),
          },
        });
      } else if (quantity !== 0) {
        await this.inventory.recordIn(
          tx,
          {
            itemId,
            locationId,
            quantity,
            transactionType: 'OPENING',
            referenceType: OPENING_REFERENCE,
            referenceId: itemId,
            unitCost: unitCost ?? undefined,
            createdById: actorId,
            date: item.openingDate,
          },
          { affectsCosting: unitCost != null },
        );
      }

      if (existing && existing.locationId !== locationId) {
        await this.inventory.recomputeBalances(tx, itemId, existing.locationId);
      }
      await this.inventory.recomputeBalances(tx, itemId, locationId);
      await this.inventory.recomputeAverageCost(tx, itemId);
      return null;
    });

    const value = quantity * (unitCost ?? 0);
    const result = await this.accounting.syncOpeningStockVoucher(
      itemId,
      quantity === 0 ? 0 : value,
      actorId,
      item.openingDate,
    );

    if (result.posted) return warning;
    return result.reason === 'NO_INVENTORY_ACCOUNT'
      ? 'Opening stock was saved, but no entry was posted to the ledger: set an Inventory account in Settings > Accounting.'
      : 'Opening stock was saved, but no entry was posted to the ledger: set an Opening Equity account in Settings > Accounting.';
  }

  async remove(id: string, actorId?: string) {
    const item = await this.findItem(id);
    const references = await this.itemReferences(id);
    if (references.length > 0) {
      throw ApiException.deleteBlocked(`Item "${item.name}"`, references);
    }
    // Delete item. If it only had opening stock movements, remove them first
    // to satisfy FK constraints (InventoryTransaction -> Item has RESTRICT).
    const [movements, openingCount] = await Promise.all([
      this.prisma.inventoryTransaction.count({ where: { itemId: id } }),
      this.prisma.inventoryTransaction.count({
        where: {
          itemId: id,
          OR: [
            { referenceType: 'OPENING_STOCK' },
            { transactionType: 'OPENING_STOCK' },
            { referenceType: OPENING_REFERENCE },
            { transactionType: OPENING_REFERENCE },
          ],
        },
      }),
    ]);
    await this.prisma.$transaction(async (tx) => {
      if (movements > 0 && openingCount === movements) {
        await tx.inventoryTransaction.deleteMany({
          where: {
            itemId: id,
            OR: [
              { referenceType: 'OPENING_STOCK' },
              { transactionType: 'OPENING_STOCK' },
              { referenceType: OPENING_REFERENCE },
              { transactionType: OPENING_REFERENCE },
            ],
          },
        });
      }
      await tx.item.delete({ where: { id } });
    });
    this.audit.record({
      userId: actorId, action: 'DELETE', module: 'ITEM', entity: 'Item',
      entityId: id, message: `Item ${item.name} deleted`,
    });
    return { id, deleted: true };
  }

  private async itemReferences(id: string): Promise<string[]> {
    const [movements, sales, purchases, salesReturns, purchaseReturns, transfers, openingCount] =
      await Promise.all([
        this.prisma.inventoryTransaction.count({ where: { itemId: id } }),
        this.prisma.saleItem.count({ where: { itemId: id } }),
        this.prisma.purchaseItem.count({ where: { itemId: id } }),
        this.prisma.salesReturnItem.count({ where: { itemId: id } }),
        this.prisma.purchaseReturnItem.count({ where: { itemId: id } }),
        this.prisma.stockTransferItem.count({ where: { itemId: id } }),
        this.prisma.inventoryTransaction.count({
          where: {
            itemId: id,
            OR: [
              { referenceType: 'OPENING_STOCK' },
              { transactionType: 'OPENING_STOCK' },
              { referenceType: OPENING_REFERENCE },
              { transactionType: OPENING_REFERENCE },
            ],
          },
        }),
      ]);
    const references: string[] = [];
    const nonOpeningMovements = Math.max(0, movements - openingCount);
    if (nonOpeningMovements) references.push(`${nonOpeningMovements} inventory movement${nonOpeningMovements === 1 ? '' : 's'}`);
    else if (movements > 0 && openingCount === movements) {
      // Only opening stock exists; safe to allow deletion after cleanup.
    }
    if (sales) references.push(`${sales} sale line${sales === 1 ? '' : 's'}`);
    if (purchases) references.push(`${purchases} purchase line${purchases === 1 ? '' : 's'}`);
    if (salesReturns) references.push(`${salesReturns} sales return line${salesReturns === 1 ? '' : 's'}`);
    if (purchaseReturns) references.push(`${purchaseReturns} purchase return line${purchaseReturns === 1 ? '' : 's'}`);
    if (transfers) references.push(`${transfers} transfer line${transfers === 1 ? '' : 's'}`);
    return references;
  }

  private async findItem(id: string) {
    const item = await this.prisma.item.findUnique({ where: { id } });
    if (!item) throw ApiException.notFound('Item');
    return item;
  }
}