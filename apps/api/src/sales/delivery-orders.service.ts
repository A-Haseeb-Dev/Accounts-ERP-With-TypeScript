import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NumberingService } from '../common/services/numbering.service';
import { InventoryService } from '../common/services/inventory.service';
import { AccountingService } from '../common/services/accounting.service';
import { DefaultAccountsService } from '../common/services/default-accounts.service';
import { FiscalPeriodGuard } from '../common/services/fiscal-period.guard';
import { ApiException } from '../common/exceptions/api.exception';
import { CreateDeliveryOrderDto } from './dto/sales.dto';
import { dateRange } from '../common/utils/date-filter';

/**
 * Delivery orders - the physical dispatch of goods to a customer.
 *
 * The sales invoice is the financial document; the delivery order is the
 * warehouse one. They are tracked separately so an invoice can be delivered
 * in parts, and so the stock ledger says when the goods actually left.
 *
 * The stock is relieved once and only once per line. If the invoice had
 * already been posted when the delivery order is posted, the invoice's
 * posting took the goods out of the warehouse and the delivery order only
 * records the dispatch. If the delivery order goes out first, it takes the
 * goods out itself and the invoice's later posting relieves only the part that
 * has not been dispatched yet.
 */
@Injectable()
export class DeliveryOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly numbering: NumberingService,
    private readonly inventory: InventoryService,
    private readonly accounting: AccountingService,
    private readonly defaultAccounts: DefaultAccountsService,
    private readonly fiscal: FiscalPeriodGuard,
  ) {}

  previewNumber() {
    return this.numbering.preview('delivery_order', 'DO');
  }

  async create(dto: CreateDeliveryOrderDto, actorId?: string) {
    const sale = dto.saleId
      ? await this.prisma.sale.findUnique({
          where: { id: dto.saleId },
          include: { items: true, customer: true },
        })
      : null;
    if (dto.saleId && !sale) throw ApiException.notFound('Sales invoice');
    if (sale?.status === 'cancelled') {
      throw ApiException.invalidTransaction('A cancelled invoice cannot be dispatched');
    }

    const customerId = dto.customerId ?? sale?.customerId;
    if (!customerId) throw ApiException.validation('Customer is required');
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw ApiException.notFound('Customer');

    const stockLocationId = dto.stockLocationId ?? sale?.stockLocationId;
    if (!stockLocationId) throw ApiException.validation('Stock location is required');
    const location = await this.prisma.stockLocation.findUnique({ where: { id: stockLocationId } });
    if (!location) throw ApiException.notFound('Stock location');

    const deliveryDate = dto.deliveryDate ? new Date(dto.deliveryDate) : new Date();
    await this.fiscal.assertOpen(deliveryDate, 'Cannot create a delivery order');

    // With no lines given, the order ships what the invoice still owes. That
    // is the common case: the invoice is raised, and the warehouse dispatches
    // it.
    const requested = dto.items?.length
      ? dto.items.map((i) => ({
          itemId: i.itemId,
          quantity: Number(i.quantity),
          unitPrice: i.unitPrice === undefined ? undefined : Number(i.unitPrice),
          saleItemId: i.saleItemId,
        }))
      : (sale?.items ?? [])
          .map((line) => ({
            itemId: line.itemId,
            quantity: round2(Number(line.quantity) - Number(line.deliveredQuantity ?? 0)),
            unitPrice: Number(line.unitPrice),
            saleItemId: line.id,
          }))
          .filter((l) => l.quantity > 0);

    if (!requested.length) {
      throw ApiException.validation(
        'There is nothing to deliver on this invoice - every line has already been dispatched.',
      );
    }

    const itemIds = requested.map((i) => i.itemId);
    const items = await this.prisma.item.findMany({ where: { id: { in: itemIds } } });
    if (items.length !== new Set(itemIds).size) {
      throw ApiException.validation('One or more items were not found');
    }
    const priceByItem = new Map((sale?.items ?? []).map((l) => [l.itemId, Number(l.unitPrice)]));

    // Every line is checked against the invoice it settles, so an order can
    // never ship more than was invoiced - not even across two orders raised
    // for the same invoice. An order with no invoice behind it is a plain
    // dispatch: there is nothing to check it against.
    const saleLines = sale?.items ?? [];
    const dispatchedFor = (line: (typeof saleLines)[number]) =>
      Number(line.deliveredQuantity ?? 0);
    for (const line of requested) {
      if (!sale) {
        line.saleItemId = undefined;
        continue;
      }
      const saleLine = line.saleItemId
        ? saleLines.find((l) => l.id === line.saleItemId)
        : saleLines.find((l) => l.itemId === line.itemId);
      if (!saleLine) {
        throw ApiException.validation(
          'One of the items is not on the invoice this delivery order settles.',
        );
      }
      const remaining = round2(Number(saleLine.quantity) - dispatchedFor(saleLine));
      if (line.quantity > remaining + 0.0001) {
        throw ApiException.validation(
          `Cannot deliver ${line.quantity} against an invoice line of ${remaining}. ` +
            'More has already been dispatched than this line still owes.',
        );
      }
      if (line.saleItemId) line.saleItemId = saleLine.id;
    }

    const lines = requested.map((line) => {
      const unitPrice = line.unitPrice ?? priceByItem.get(line.itemId) ?? 0;
      return {
        itemId: line.itemId,
        saleItemId: line.saleItemId ?? null,
        quantity: round2(line.quantity),
        unitPrice,
        lineTotal: round2(line.quantity * unitPrice),
      };
    });
    const subtotal = round2(lines.reduce((s, l) => s + l.lineTotal, 0));

    const number = await this.numbering.next('delivery_order', 'DO');
    const order = await this.prisma.runInTransaction(async (tx) => {
      const created = await tx.deliveryOrder.create({
        data: {
          number,
          deliveryDate,
          saleId: dto.saleId ?? null,
          customerId,
          stockLocationId,
          reference: dto.reference ?? null,
          deliveryTo: dto.deliveryTo ?? null,
          vehicleNo: dto.vehicleNo ?? null,
          driverName: dto.driverName ?? null,
          driverPhone: dto.driverPhone ?? null,
          note: dto.note ?? null,
          subtotal,
          grandTotal: subtotal,
          status: 'draft',
          createdById: actorId,
          items: { create: lines },
        },
        include: { items: { include: { item: true } }, customer: true, stockLocation: true },
      });
      this.audit.record({
        userId: actorId,
        action: 'CREATE',
        module: 'SALE',
        entity: 'DeliveryOrder',
        entityId: created.id,
        message: `Delivery order ${number} created for ${customer.name} (${subtotal})`,
      });
      return created;
    });
    return order;
  }

  async findAll(query: {
    page?: number; pageSize?: number; search?: string; status?: string;
    customerId?: string; saleId?: string; from?: string; to?: string;
  }) {
    const { page = 1, pageSize = 25, search, status, customerId, saleId, from, to } = query;
    const where: Record<string, unknown> = {};
    if (search) {
      where.OR = [
        { number: { contains: search, mode: 'insensitive' } },
        { reference: { contains: search, mode: 'insensitive' } },
        { customer: { name: { contains: search, mode: 'insensitive' } } },
        { vehicleNo: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (status) where.status = status;
    if (customerId) where.customerId = customerId;
    if (saleId) where.saleId = saleId;
    if (from || to) where.deliveryDate = dateRange(from, to);

    const [items, total] = await Promise.all([
      this.prisma.deliveryOrder.findMany({
        where,
        include: {
          customer: true,
          stockLocation: true,
          sale: { select: { id: true, number: true, grandTotal: true, status: true } },
          items: { include: { item: true } },
        },
        orderBy: { deliveryDate: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.deliveryOrder.count({ where }),
    ]);
    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async findOne(id: string) {
    const order = await this.prisma.deliveryOrder.findUnique({
      where: { id },
      include: {
        customer: true,
        stockLocation: true,
        sale: { include: { items: true } },
        items: { include: { item: true } },
        createdBy: { select: { id: true, fullName: true } },
      },
    });
    if (!order) throw ApiException.notFound('Delivery order');
    return order;
  }

  async update(id: string, dto: CreateDeliveryOrderDto, actorId?: string) {
    const order = await this.prisma.deliveryOrder.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!order) throw ApiException.notFound('Delivery order');
    if (order.status === 'posted') {
      throw ApiException.invalidTransaction(
        `"${order.number}" is posted and can no longer be edited.`,
      );
    }
    if (order.status === 'cancelled') {
      throw ApiException.invalidTransaction(`"${order.number}" is cancelled and cannot be edited.`);
    }
    if (order.status === 'pending') {
      throw ApiException.invalidTransaction(
        'A pending delivery order must be rejected before it can be edited.',
      );
    }

    const deliveryDate = dto.deliveryDate ? new Date(dto.deliveryDate) : order.deliveryDate;
    await this.fiscal.assertOpen(deliveryDate, 'Cannot update a delivery order');

    const sale = dto.saleId
      ? await this.prisma.sale.findUnique({ where: { id: dto.saleId }, include: { items: true } })
      : order.saleId
        ? await this.prisma.sale.findUnique({ where: { id: order.saleId }, include: { items: true } })
        : null;

    const requested = (dto.items ?? []).map((i) => ({
      itemId: i.itemId,
      quantity: Number(i.quantity),
      unitPrice: i.unitPrice === undefined ? undefined : Number(i.unitPrice),
      saleItemId: i.saleItemId,
    }));
    if (!requested.length) throw ApiException.validation('At least one item is required');

    const itemIds = requested.map((i) => i.itemId);
    const items = await this.prisma.item.findMany({ where: { id: { in: itemIds } } });
    if (items.length !== new Set(itemIds).size) {
      throw ApiException.validation('One or more items were not found');
    }

    const saleLines = sale?.items ?? [];
    for (const line of requested) {
      if (!sale) {
        line.saleItemId = undefined;
        continue;
      }
      const saleLine = line.saleItemId
        ? saleLines.find((l) => l.id === line.saleItemId)
        : saleLines.find((l) => l.itemId === line.itemId);
      if (!saleLine) {
        throw ApiException.validation(
          'One of the items is not on the invoice this delivery order settles.',
        );
      }
      const remaining = round2(
        Number(saleLine.quantity) - Number(saleLine.deliveredQuantity ?? 0),
      );
      if (line.quantity > remaining + 0.0001) {
        throw ApiException.validation(
          `Cannot deliver ${line.quantity} against an invoice line of ${remaining}.`,
        );
      }
      if (line.saleItemId) line.saleItemId = saleLine.id;
    }

    const lines = requested.map((line) => {
      const unitPrice =
        line.unitPrice ??
        saleLines.find((l) => l.itemId === line.itemId)?.unitPrice ??
        Number(line.unitPrice ?? 0);
      return {
        itemId: line.itemId,
        saleItemId: line.saleItemId ?? null,
        quantity: round2(line.quantity),
        unitPrice: Number(unitPrice),
        lineTotal: round2(line.quantity * Number(unitPrice)),
      };
    });
    const subtotal = round2(lines.reduce((s, l) => s + l.lineTotal, 0));

    const updated = await this.prisma.runInTransaction(async (tx) => {
      await tx.deliveryOrderItem.deleteMany({ where: { deliveryOrderId: id } });
      return tx.deliveryOrder.update({
        where: { id },
        data: {
          deliveryDate,
          saleId: dto.saleId ?? order.saleId,
          customerId: dto.customerId ?? order.customerId,
          stockLocationId: dto.stockLocationId ?? order.stockLocationId,
          reference: dto.reference ?? order.reference,
          deliveryTo: dto.deliveryTo ?? order.deliveryTo,
          vehicleNo: dto.vehicleNo ?? order.vehicleNo,
          driverName: dto.driverName ?? order.driverName,
          driverPhone: dto.driverPhone ?? order.driverPhone,
          note: dto.note ?? order.note,
          subtotal,
          grandTotal: subtotal,
          items: { create: lines },
        },
        include: { items: { include: { item: true } }, customer: true, stockLocation: true },
      });
    });

    this.audit.record({
      userId: actorId,
      action: 'UPDATE',
      module: 'SALE',
      entity: 'DeliveryOrder',
      entityId: id,
      message: `Delivery order ${order.number} updated`,
    });
    return updated;
  }

  /**
   * Posts a delivery order: the goods leave the warehouse and the dispatch is
   * recorded against the invoice.
   *
   * The stock is relieved once. If the invoice was posted first, its posting
   * already took those goods out of the warehouse, and this order only
   * records that they were dispatched. If the order goes out before the
   * invoice, it relieves the stock itself and the invoice's later posting
   * relieves only what is left.
   */
  async post(id: string, actorId?: string) {
    const order = await this.findOne(id);
    if (order.status === 'posted') return order;
    if (order.status === 'cancelled') {
      throw ApiException.invalidTransaction('A cancelled delivery order cannot be posted');
    }
    await this.fiscal.assertOpen(order.deliveryDate, 'Cannot post a delivery order');

    const sale = order.saleId
      ? await this.prisma.sale.findUnique({ where: { id: order.saleId }, include: { items: true } })
      : null;
    const invoiceAlreadyRelieved = sale?.status === 'posted';

    // The invoice is the source of truth for what may still be dispatched, and
    // it can have moved since the order was raised.
    if (sale) {
      for (const line of order.items) {
        const saleLine = line.saleItemId
          ? sale.items.find((l) => l.id === line.saleItemId)
          : sale.items.find((l) => l.itemId === line.itemId);
        if (!saleLine) {
          throw ApiException.validation(
            'One of the items is no longer on the invoice this delivery order settles.',
          );
        }
        const remaining = round2(
          Number(saleLine.quantity) - Number(saleLine.deliveredQuantity ?? 0),
        );
        if (Number(line.quantity) > remaining + 0.0001) {
          throw ApiException.invalidTransaction(
            `Cannot dispatch ${line.quantity} against an invoice line of ${remaining}. ` +
              'More has already been dispatched than this line still owes.',
          );
        }
      }
    }

    const negativeSetting = await this.prisma.systemSetting.findFirst({
      where: { key: 'inventory.negative_stock' },
    });
    const allowNegative = negativeSetting?.value === 'true';

    const postBody = async (tx: any) => {
      let costOfGoodsSold = 0;
      if (!invoiceAlreadyRelieved) {
        const itemIds = order.items.map((l) => l.itemId);
        const costRows: { id: string; averageCost: unknown }[] = itemIds.length
          ? await tx.item.findMany({ where: { id: { in: itemIds } }, select: { id: true, averageCost: true } })
          : [];
        const costByItem = new Map<string, number>(
          costRows.map((r: { id: string; averageCost: unknown }) => [r.id, Number(r.averageCost ?? 0)]),
        );

        for (const line of order.items) {
          const unitCost = costByItem.get(line.itemId) ?? 0;
          costOfGoodsSold = round2(costOfGoodsSold + Number(line.quantity) * unitCost);
          try {
            await this.inventory.recordOut(
              tx,
              {
                itemId: line.itemId,
                locationId: order.stockLocationId,
                quantity: Number(line.quantity),
                transactionType: 'DELIVERY',
                referenceType: 'DeliveryOrder',
                referenceId: order.id,
                unitCost,
                createdById: actorId,
              },
              { allowNegative },
            );
          } catch (err) {
            if ((err as Error).message.startsWith('ERR_INSUFFICIENT_STOCK')) {
              const item = await this.prisma.item.findUnique({ where: { id: line.itemId } });
              const available = await this.inventory.getBalance(
                line.itemId,
                order.stockLocationId,
                tx,
              );
              throw ApiException.insufficientStock(
                item?.name ?? line.itemId,
                available,
                Number(line.quantity),
              );
            }
            throw err;
          }
        }

        // The goods have left but have not been invoiced yet, so the cost of
        // the goods goes: Dr Cost of Sales, Cr Inventory.
        if (costOfGoodsSold !== 0) {
          const [costOfSales, inventoryAccount] = await Promise.all([
            this.defaultAccounts.resolveAccount('accounting.cost_of_sales_account'),
            this.defaultAccounts.resolveAccount('accounting.inventory_account'),
          ]);
          if (costOfSales && inventoryAccount) {
            const voucher = await this.accounting.createVoucher(
              tx,
              {
                voucherType: 'JOURNAL',
                voucherDate: order.deliveryDate,
                description: `Delivery order ${order.number} - ${order.customer.name}`,
                reference: order.number,
                entries: [
                  {
                    mainAccountId: costOfSales,
                    debit: costOfGoodsSold,
                    narration: `Cost of goods delivered ${order.number}`,
                  },
                  {
                    mainAccountId: inventoryAccount,
                    credit: costOfGoodsSold,
                    narration: `Cost of goods delivered ${order.number}`,
                  },
                ],
                createdById: actorId,
              },
              await this.numbering.next('voucher_journal', 'JV', tx),
            );
            await this.accounting.postVoucher(tx, voucher.id, actorId);
          }
        }
      }

      // Record the dispatch against the invoice lines, so the invoice can be
      // delivered in parts and the "still to deliver" figure stays right.
      for (const line of order.items) {
        if (!line.saleItemId) continue;
        await tx.saleItem.update({
          where: { id: line.saleItemId },
          data: { deliveredQuantity: { increment: Number(line.quantity) } },
        });
      }

      const updated = await tx.deliveryOrder.update({
        where: { id },
        data: {
          status: 'posted',
          postedAt: new Date(),
          postedById: actorId,
          stockRelieved: !invoiceAlreadyRelieved,
        },
        include: { items: { include: { item: true } }, customer: true, stockLocation: true },
      });

      this.audit.record({
        userId: actorId,
        action: 'POST',
        module: 'SALE',
        entity: 'DeliveryOrder',
        entityId: id,
        message: invoiceAlreadyRelieved
          ? `Delivery order ${order.number} posted - dispatch recorded (stock relieved by invoice ${sale?.number})`
          : `Delivery order ${order.number} posted (stock relieved)`,
      });
      return updated;
    };

    return this.prisma.runInTransaction(postBody);
  }

  async submit(id: string, actorId?: string) {
    const order = await this.prisma.deliveryOrder.findUnique({ where: { id } });
    if (!order) throw ApiException.notFound('Delivery order');
    if (order.status === 'posted' || order.status === 'cancelled') {
      throw ApiException.invalidTransaction(
        `A ${order.status} delivery order cannot be submitted for approval`,
      );
    }
    if (order.status === 'pending') return order;
    return this.prisma.deliveryOrder.update({
      where: { id },
      data: { status: 'pending', submittedById: actorId ?? null, submittedAt: new Date() },
    });
  }

  async reject(id: string, reason: string, actorId?: string) {
    const order = await this.prisma.deliveryOrder.findUnique({ where: { id } });
    if (!order) throw ApiException.notFound('Delivery order');
    if (order.status !== 'pending') {
      throw ApiException.invalidTransaction(
        `Only pending delivery orders can be rejected. "${order.number}" is ${order.status}.`,
      );
    }
    const rejected = await this.prisma.deliveryOrder.update({
      where: { id },
      data: {
        status: 'draft',
        rejectedById: actorId ?? null,
        rejectedAt: new Date(),
        rejectReason: reason ?? 'Rejected',
      },
    });
    this.audit.record({
      userId: actorId,
      action: 'REJECT',
      module: 'SALE',
      entity: 'DeliveryOrder',
      entityId: id,
      message: `Delivery order ${order.number} rejected`,
      metadata: { reason },
    });
    return rejected;
  }

  /**
   * Cancels a delivery order.
   *
   * A posted order is reversed: the goods that went out come back into the
   * stock, the voucher is cancelled and the dispatch is struck off the
   * invoice. A draft order simply changes its status.
   */
  async cancel(id: string, reason: string, actorId?: string) {
    const order = await this.findOne(id);
    if (order.status === 'cancelled') return order;
    if (order.status === 'posted') {
      await this.reversePostedEffects(order, actorId, 'cancelled');
    }
    const cancelled = await this.prisma.deliveryOrder.update({
      where: { id },
      data: { status: 'cancelled', cancelReason: reason, cancelledAt: new Date() },
    });
    this.audit.record({
      userId: actorId,
      action: 'CANCEL',
      module: 'SALE',
      entity: 'DeliveryOrder',
      entityId: id,
      message: `Delivery order ${order.number} cancelled`,
      metadata: { reason },
    });
    return cancelled;
  }

  /**
   * Deletes a delivery order. A posted one is reversed first, so the stock
   * and the ledger stay right.
   */
  async remove(id: string, actorId?: string) {
    const order = await this.findOne(id);
    const wasPosted = order.status === 'posted';
    if (wasPosted) {
      await this.reversePostedEffects(order, actorId, 'deleted');
    }
    await this.prisma.deliveryOrder.delete({ where: { id } });
    this.audit.record({
      userId: actorId,
      action: 'DELETE',
      module: 'SALE',
      entity: 'DeliveryOrder',
      entityId: id,
      message: `Delivery order ${order.number} deleted${wasPosted ? ' (stock returned)' : ''}`,
    });
    return { id, deleted: true };
  }

  /**
   * Undoes what a posted delivery order did: the stock comes back, the
   * voucher is cancelled and the dispatch is struck off the invoice.
   */
  private async reversePostedEffects(order: any, actorId?: string, reason = 'reversed') {
    await this.prisma.runInTransaction(async (tx) => {
      if (order.stockRelieved) {
        const itemIds = order.items.map((l: any) => l.itemId);
        const costRows: { id: string; averageCost: unknown }[] = itemIds.length
          ? await tx.item.findMany({
              where: { id: { in: itemIds } },
              select: { id: true, averageCost: true },
            })
          : [];
        const costByItem = new Map<string, number>(
          costRows.map((r: { id: string; averageCost: unknown }) => [r.id, Number(r.averageCost ?? 0)]),
        );
        for (const line of order.items) {
          await this.inventory.recordIn(tx, {
            itemId: line.itemId,
            locationId: order.stockLocationId,
            quantity: Number(line.quantity),
            transactionType: 'DELIVERY_ADJUST',
            referenceType: 'DeliveryOrder',
            referenceId: order.id,
            unitCost: costByItem.get(line.itemId) ?? 0,
            createdById: actorId,
          });
        }
        const vouchers = await tx.voucher.findMany({ where: { reference: order.number } });
        for (const v of vouchers) {
          await this.accounting.cancelVoucher(
            tx,
            v.id,
            `Delivery order ${order.number} ${reason}`,
            actorId,
          );
        }
      }
      for (const line of order.items) {
        if (!line.saleItemId) continue;
        await tx.saleItem.update({
          where: { id: line.saleItemId },
          data: { deliveredQuantity: { decrement: Number(line.quantity) } },
        });
      }
    });
  }
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
