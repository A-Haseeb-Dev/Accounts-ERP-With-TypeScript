import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NumberingService } from '../common/services/numbering.service';
import { InventoryService } from '../common/services/inventory.service';
import { AccountingService } from '../common/services/accounting.service';
import { DefaultAccountsService } from '../common/services/default-accounts.service';
import { FiscalPeriodGuard } from '../common/services/fiscal-period.guard';
import { ApiException } from '../common/exceptions/api.exception';
import { CreateSaleDto } from './dto/sales.dto';
import { dateRange } from '../common/utils/date-filter';

@Injectable()
export class SalesService {
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
    return this.numbering.preview('sale', 'SI');
  }

  async create(dto: CreateSaleDto, actorId?: string) {
    await this.fiscal.assertOpen(dto.saleDate, 'Cannot create a sales invoice');
    const customer = await this.prisma.customer.findUnique({ where: { id: dto.customerId } });
    if (!customer) throw ApiException.notFound('Customer');
    const location = await this.prisma.stockLocation.findUnique({ where: { id: dto.stockLocationId } });
    if (!location) throw ApiException.notFound('Stock location');

    // Validate items exist.
    const itemIds = dto.items.map((i) => i.itemId);
    const items = await this.prisma.item.findMany({ where: { id: { in: itemIds } } });
    if (items.length !== new Set(itemIds).size) {
      throw ApiException.validation('One or more items were not found');
    }

    const totals = this.computeTotals(dto.items, dto.discount ?? 0, dto.tax ?? 0);
    const amountPaid = Math.min(dto.amountPaid ?? 0, totals.grandTotal);
    const paymentStatus =
      amountPaid >= totals.grandTotal ? 'paid' : amountPaid > 0 ? 'partial' : 'unpaid';
    const dueDate = resolveDueDate(dto, customer);

    const number = await this.numbering.next('sale', 'SI');

    const sale = await this.prisma.runInTransaction(async (tx) => {
      const header = await tx.sale.create({
        data: {
          number,
          saleDate: new Date(dto.saleDate),
          dueDate,
          reference: dto.reference ?? null,
          note: dto.note ?? null,
          customerId: dto.customerId,
          stockLocationId: dto.stockLocationId,
          subtotal: totals.subtotal,
          discount: totals.discount,
          tax: totals.tax,
          commission: dto.commission ?? 0,
          grandTotal: totals.grandTotal,
          paymentStatus,
          amountPaid,
          status: 'draft',
          createdById: actorId,
          items: {
            create: dto.items.map((item) => ({
              itemId: item.itemId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              discount: item.discount ?? 0,
              tax: item.tax ?? 0,
              lineTotal: round2(
                item.quantity * item.unitPrice - (item.discount ?? 0) + (item.tax ?? 0),
              ),
            })),
          },
        },
        include: { items: true, customer: true, stockLocation: true },
      });

      this.audit.record({
        userId: actorId,
        action: 'CREATE',
        module: 'SALE',
        entity: 'Sale',
        entityId: header.id,
        message: `Sales invoice ${number} created for ${customer.name} (${header.grandTotal})`,
      });
      return header;
    });
    return sale;
  }

  async post(id: string, actorId?: string) {
    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: { items: true, customer: true, stockLocation: true },
    });
    if (!sale) throw ApiException.notFound('Sales invoice');
    if (sale.status === 'posted') return sale;
    if (sale.status === 'cancelled') {
      throw ApiException.invalidTransaction('A cancelled invoice cannot be posted');
    }
    await this.fiscal.assertOpen(sale.saleDate, 'Cannot post a sales invoice');

    const revenueAccountId =
      (await this.defaultAccounts.resolveAccount('accounting.revenue_account', 'Sales Revenue')) ??
      undefined;
    const receivableAccountId =
      sale.customer.mainAccountId ??
      ((await this.defaultAccounts.resolveAccount('accounting.receivable_account', 'Accounts Receivable')) ??
        undefined);

    if (!revenueAccountId || !receivableAccountId) {
      throw ApiException.invalidTransaction(
        'Customer is not linked to an account and the receivables control account is not configured.',
      );
    }

    const inventoryAccountId =
      (await this.defaultAccounts.resolveAccount('accounting.inventory_account', 'Inventory')) ??
      undefined;
    const costOfSalesAccountId =
      (await this.defaultAccounts.resolveAccount('accounting.cost_of_sales_account', 'Cost of Sales')) ??
      undefined;

    if (!inventoryAccountId || !costOfSalesAccountId) {
      throw ApiException.invalidTransaction(
        'The inventory or cost of sales account is not configured, so the cost of the goods sold cannot be recorded.',
      );
    }

    const negativeSetting = await this.prisma.systemSetting.findFirst({
      where: { key: 'inventory.negative_stock' },
    });
    const allowNegative = negativeSetting?.value === 'true';

    const result = await this.prisma.runInTransaction(async (tx) => {
      // 1. Validate and reduce stock for each line, relieving it at the item's
      //    weighted-average cost. The selling price is not a cost basis.
      const itemIds = sale.items.map((l: any) => l.itemId);
      const costRows: { id: string; averageCost: unknown }[] = itemIds.length
        ? await tx.item.findMany({ where: { id: { in: itemIds } }, select: { id: true, averageCost: true } })
        : [];
      const costByItem = new Map<string, number>(
        costRows.map((r) => [r.id, Number(r.averageCost ?? 0)]),
      );

      let costOfGoodsSold = 0;
      for (const line of sale.items) {
        const unitCost = costByItem.get(line.itemId) ?? 0;
        costOfGoodsSold = round2(costOfGoodsSold + Number(line.quantity) * unitCost);
        try {
          await this.inventory.recordOut(
            tx,
            {
              itemId: line.itemId,
              locationId: sale.stockLocationId,
              quantity: Number(line.quantity),
              transactionType: 'SALE',
              referenceType: 'Sale',
              referenceId: sale.id,
              unitCost,
              createdById: actorId,
            },
            { allowNegative },
          );
        } catch (err) {
          if ((err as Error).message.startsWith('ERR_INSUFFICIENT_STOCK')) {
            const item = await this.prisma.item.findUnique({ where: { id: line.itemId } });
            const available = await this.inventory.getBalance(line.itemId, sale.stockLocationId, tx);
            throw ApiException.insufficientStock(
              item?.name ?? line.itemId,
              available,
              Number(line.quantity),
            );
          }
          throw err;
        }
      }

      // 2. Accounting: Dr Customer/Receivable, Cr Sales Revenue (+ tax payable).
      const entries = [
        {
          mainAccountId: receivableAccountId,
          debit: Number(sale.grandTotal),
          narration: `Sale ${sale.number}`,
        },
        {
          mainAccountId: revenueAccountId,
          credit: Number(sale.subtotal) - Number(sale.discount),
          narration: `Sale ${sale.number}`,
        },
      ];
      if (Number(sale.tax) > 0) {
        const taxAccountId = await this.defaultAccounts.resolveAccount(
          'accounting.tax_account',
          'Sales Tax Payable',
        );
        if (taxAccountId) {
          entries.push({ mainAccountId: taxAccountId, credit: Number(sale.tax), narration: `Tax ${sale.number}` });
        } else {
          // No tax account configured: book the tax as part of revenue rather
          // than dropping the entry, which would leave the voucher unbalanced
          // and fail the post.
          entries[1].credit = round2(Number(entries[1].credit) + Number(sale.tax));
        }
      }

      // Cost of the goods actually sold, at average cost: without this the
      // inventory asset never reduces on a sale and the profit and loss shows
      // revenue with no cost against it.
      if (costOfGoodsSold !== 0) {
        entries.push({
          mainAccountId: costOfSalesAccountId,
          debit: costOfGoodsSold,
          narration: `Cost of sales ${sale.number}`,
        });
        entries.push({
          mainAccountId: inventoryAccountId,
          credit: costOfGoodsSold,
          narration: `Cost of sales ${sale.number}`,
        });
      }

      // Commission (if any): Dr Commission Expense, Cr Commission Payable.
      // The receivable and revenue accounts are untouched — this is an extra
      // expense the business owes (e.g. to an agent), booked alongside the sale.
      if (Number(sale.commission) > 0) {
        const commissionExpenseId = await this.defaultAccounts.resolveAccount(
          'accounting.commission_expense_account',
          'Commission Expense',
        );
        const commissionPayableId = await this.defaultAccounts.resolveAccount(
          'accounting.commission_payable_account',
          'Commission Payable',
        );
        if (commissionExpenseId && commissionPayableId) {
          entries.push({
            mainAccountId: commissionExpenseId,
            debit: Number(sale.commission),
            narration: `Commission ${sale.number}`,
          });
          entries.push({
            mainAccountId: commissionPayableId,
            credit: Number(sale.commission),
            narration: `Commission ${sale.number}`,
          });
        }
      }

      const voucher = await this.accounting.createVoucher(
        tx,
        {
          voucherType: 'JOURNAL',
          voucherDate: new Date(sale.saleDate),
          description: `Sales invoice ${sale.number} - ${sale.customer.name}`,
          reference: sale.number,
          entries,
          createdById: actorId,
        },
        await this.numbering.next('voucher_sale', 'SV', tx),
      );
      await this.accounting.postVoucher(tx, voucher.id, actorId);

      // 3. If cash was paid, create a cash receipt voucher.
      if (Number(sale.amountPaid) > 0) {
        const cashAccountId = await this.defaultAccounts.resolveAccount('accounting.cash_account', 'Cash Account');
        if (cashAccountId) {
          const cashVoucher = await this.accounting.createVoucher(
            tx,
            {
              voucherType: 'DEBIT',
              voucherDate: new Date(sale.saleDate),
              description: `Cash receipt for ${sale.number}`,
              reference: sale.number,
              entries: [
                { mainAccountId: cashAccountId, debit: Number(sale.amountPaid), narration: `Cash received ${sale.number}` },
                { mainAccountId: receivableAccountId, credit: Number(sale.amountPaid), narration: `Payment ${sale.number}` },
              ],
              createdById: actorId,
            },
            await this.numbering.next('voucher_receipt', 'RV', tx),
          );
          await this.accounting.postVoucher(tx, cashVoucher.id, actorId);
        }
      }

      const updated = await tx.sale.update({
        where: { id: sale.id },
        data: { status: 'posted', postedAt: new Date(), postedById: actorId },
        include: { items: true, customer: true, stockLocation: true },
      });

      this.audit.record({
        userId: actorId,
        action: 'POST',
        module: 'SALE',
        entity: 'Sale',
        entityId: sale.id,
        message: `Sales invoice ${sale.number} posted (${sale.grandTotal})`,
      });
      return updated;
    });
    return result;
  }

  async submit(id: string, actorId?: string) {
    const sale = await this.prisma.sale.findUnique({ where: { id } });
    if (!sale) throw ApiException.notFound('Sales invoice');
    if (sale.status === 'posted' || sale.status === 'cancelled') {
      throw ApiException.invalidTransaction(
        `A ${sale.status} invoice cannot be submitted for approval`,
      );
    }
    if (sale.status === 'pending') return sale;

    return this.prisma.sale.update({
      where: { id },
      data: { status: 'pending', submittedById: actorId ?? null, submittedAt: new Date() },
    });
  }

  async reject(id: string, reason: string, actorId?: string) {
    const sale = await this.prisma.sale.findUnique({ where: { id } });
    if (!sale) throw ApiException.notFound('Sales invoice');
    if (sale.status !== 'pending') {
      throw ApiException.invalidTransaction(
        `Only pending invoices can be rejected. "${sale.number}" is ${sale.status}.`,
      );
    }
    if (sale.postedAt) {
      throw ApiException.invalidTransaction('A posted invoice cannot be rejected');
    }

    const rejected = await this.prisma.sale.update({
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
      entity: 'Sale',
      entityId: id,
      message: `Sales invoice ${sale.number} rejected`,
      metadata: { reason },
    });
    return rejected;
  }

  async update(id: string, dto: CreateSaleDto, actorId?: string) {
    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!sale) throw ApiException.notFound('Sales invoice');
    if (sale.status === 'cancelled') {
      throw ApiException.invalidTransaction(
        `"${sale.number}" is cancelled and cannot be edited.`,
      );
    }
    if (sale.status === 'pending') {
      throw ApiException.invalidTransaction(
        'A pending invoice must be rejected before it can be edited.',
      );
    }
    await this.fiscal.assertOpen(dto.saleDate, 'Cannot update a sales invoice');

    const customer = await this.prisma.customer.findUnique({ where: { id: dto.customerId } });
    if (!customer) throw ApiException.notFound('Customer');
    const location = await this.prisma.stockLocation.findUnique({ where: { id: dto.stockLocationId } });
    if (!location) throw ApiException.notFound('Stock location');

    const itemIds = dto.items.map((i) => i.itemId);
    const items = await this.prisma.item.findMany({ where: { id: { in: itemIds } } });
    if (items.length !== new Set(itemIds).size) {
      throw ApiException.validation('One or more items were not found');
    }

    const totals = this.computeTotals(dto.items, dto.discount ?? 0, dto.tax ?? 0);
    const amountPaid = Math.min(dto.amountPaid ?? 0, totals.grandTotal);
    const paymentStatus =
      amountPaid >= totals.grandTotal ? 'paid' : amountPaid > 0 ? 'partial' : 'unpaid';
    const dueDate = resolveDueDate(dto, customer);

    const wasPosted = sale.status === 'posted';

    const updated = await this.prisma.runInTransaction(async (tx) => {
      if (wasPosted) {
        await this.reversePostedEffects(tx, sale, actorId, 'edited');
      }
      await tx.saleItem.deleteMany({ where: { saleId: id } });
      return tx.sale.update({
        where: { id },
        data: {
          ...(wasPosted ? { status: 'draft' } : {}),
          saleDate: new Date(dto.saleDate),
          dueDate,
          reference: dto.reference ?? null,
          note: dto.note ?? null,
          customerId: dto.customerId,
          stockLocationId: dto.stockLocationId,
          subtotal: totals.subtotal,
          discount: totals.discount,
          tax: totals.tax,
          commission: dto.commission ?? 0,
          grandTotal: totals.grandTotal,
          paymentStatus,
          amountPaid,
          items: {
            create: dto.items.map((item) => ({
              itemId: item.itemId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              discount: item.discount ?? 0,
              tax: item.tax ?? 0,
              lineTotal: round2(
                item.quantity * item.unitPrice - (item.discount ?? 0) + (item.tax ?? 0),
              ),
            })),
          },
        },
        include: { items: true, customer: true, stockLocation: true },
      });
    });

    this.audit.record({
      userId: actorId,
      action: 'UPDATE',
      module: 'SALE',
      entity: 'Sale',
      entityId: id,
      message: `Sales invoice ${sale.number} updated${wasPosted ? ' and re-posted' : ''}`,
    });
    if (wasPosted) {
      return this.post(id, actorId);
    }
    return updated;
  }

  async remove(id: string, actorId?: string) {
    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!sale) throw ApiException.notFound('Sales invoice');
    if (sale.status === 'cancelled') {
      throw ApiException.invalidTransaction(
        `"${sale.number}" is cancelled and cannot be deleted.`,
      );
    }
    await this.fiscal.assertOpen(sale.saleDate, 'Cannot delete a sales invoice');

    const wasPosted = sale.status === 'posted';
    await this.prisma.runInTransaction(async (tx) => {
      if (wasPosted) {
        await this.reversePostedEffects(tx, sale, actorId, 'deleted');
      }
      await tx.sale.delete({ where: { id } });
    });
    this.audit.record({
      userId: actorId,
      action: 'DELETE',
      module: 'SALE',
      entity: 'Sale',
      entityId: id,
      message: `Sales invoice ${sale.number} deleted${wasPosted ? ' (accounting reversed)' : ''}`,
    });
    return { id, deleted: true };
  }

  /**
   * Reverses the stock and accounting effects of a posted invoice so it can be
   * edited or permanently removed. Stock is put back through a compensating
   * transaction and the linked vouchers are cancelled (preserved for audit).
   */
  private async reversePostedEffects(tx: any, sale: any, actorId?: string, reason = 'adjusted') {
    const itemIds = sale.items.map((l: any) => l.itemId);
    const costRows: { id: string; averageCost: unknown }[] = itemIds.length
      ? await tx.item.findMany({ where: { id: { in: itemIds } }, select: { id: true, averageCost: true } })
      : [];
    const costByItem = new Map<string, number>(
      costRows.map((r) => [r.id, Number(r.averageCost ?? 0)]),
    );

    for (const line of sale.items) {
      await this.inventory.recordIn(tx, {
        itemId: line.itemId,
        locationId: sale.stockLocationId,
        quantity: Number(line.quantity),
        transactionType: 'SALE_ADJUST',
        referenceType: 'Sale',
        referenceId: sale.id,
        unitCost: costByItem.get(line.itemId) ?? 0,
        createdById: actorId,
      });
    }
    const vouchers = await tx.voucher.findMany({ where: { reference: sale.number } });
    for (const v of vouchers) {
      await this.accounting.cancelVoucher(tx, v.id, `Sales invoice ${sale.number} ${reason}`, actorId);
    }
  }

  async cancel(id: string, reason: string, actorId?: string) {
    const sale = await this.prisma.sale.findUnique({ where: { id } });
    if (!sale) throw ApiException.notFound('Sales invoice');
    if (sale.status === 'cancelled') return sale;
    await this.fiscal.assertOpen(sale.saleDate, 'Cannot cancel a sales invoice');
    if (sale.status === 'posted') {
      throw ApiException.invalidTransaction(
        'Posted invoices cannot be cancelled. Use a sales return to reverse the stock and receivable.',
      );
    }

    const cancelled = await this.prisma.runInTransaction(async (tx) => {
      const result = await tx.sale.update({
        where: { id },
        data: { status: 'cancelled', cancelReason: reason, cancelledAt: new Date() },
      });
      this.audit.record({
        userId: actorId,
        action: 'CANCEL',
        module: 'SALE',
        entity: 'Sale',
        entityId: id,
        message: `Sales invoice ${sale.number} cancelled`,
        metadata: { reason },
      });
      return result;
    });
    return cancelled;
  }

  async findAll(query: {
    page?: number; pageSize?: number; search?: string; status?: string;
    customerId?: string; from?: string; to?: string;
  }) {
    const { page = 1, pageSize = 25, search, status, customerId, from, to } = query;
    const where: Record<string, unknown> = {};
    if (search) {
      where.OR = [
        { number: { contains: search, mode: 'insensitive' } },
        { reference: { contains: search, mode: 'insensitive' } },
        { customer: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }
    if (status) where.status = status;
    if (customerId) where.customerId = customerId;
    if (from || to) {
      where.saleDate = dateRange(from, to);
    }

    const [items, total] = await Promise.all([
      this.prisma.sale.findMany({
        where,
        include: { customer: true, stockLocation: true, items: { include: { item: true } } },
        orderBy: { saleDate: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.sale.count({ where }),
    ]);
    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async findOne(id: string) {
    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: {
        customer: { include: { town: true } },
        stockLocation: true,
        items: { include: { item: true } },
        createdBy: { select: { id: true, fullName: true } },
        salesReturns: { include: { items: true } },
      },
    });
    if (!sale) throw ApiException.notFound('Sales invoice');
    return sale;
  }

  private computeTotals(items: any[], headerDiscount: number, headerTax: number) {
    const subtotal = round2(
      items.reduce(
        (s, i) => s + i.quantity * i.unitPrice - (i.discount ?? 0) + (i.tax ?? 0),
        0,
      ),
    );
    const discount = round2(headerDiscount);
    const tax = round2(headerTax);
    const grandTotal = round2(subtotal - discount + tax);
    return { subtotal, discount, tax, grandTotal };
  }
}

function resolveDueDate(
  dto: { saleDate: Date; dueDate?: string },
  customer: { creditDays?: number | null },
): Date {
  if (dto.dueDate) return new Date(dto.dueDate);
  const days = customer.creditDays ?? 30;
  const due = new Date(dto.saleDate);
  due.setDate(due.getDate() + days);
  return due;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}