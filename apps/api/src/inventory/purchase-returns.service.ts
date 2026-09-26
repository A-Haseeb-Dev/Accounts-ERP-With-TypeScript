import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NumberingService } from '../common/services/numbering.service';
import { InventoryService } from '../common/services/inventory.service';
import { AccountingService } from '../common/services/accounting.service';
import { DefaultAccountsService } from '../common/services/default-accounts.service';
import { FiscalPeriodGuard } from '../common/services/fiscal-period.guard';
import { ApiException } from '../common/exceptions/api.exception';
import { CreatePurchaseReturnDto } from './dto/inventory.dto';
import type { VoucherEntryInput } from '../common/services/accounting.service';
import { dateRange } from '../common/utils/date-filter';

@Injectable()
export class PurchaseReturnsService {
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
    return this.numbering.preview('purchase_return', 'PR');
  }

  async create(dto: CreatePurchaseReturnDto, actorId?: string) {
    await this.fiscal.assertOpen(dto.returnDate, 'Cannot create a purchase return');
    const supplier = await this.prisma.supplier.findUnique({ where: { id: dto.supplierId } });
    if (!supplier) throw ApiException.notFound('Supplier');
    const location = await this.prisma.stockLocation.findUnique({ where: { id: dto.stockLocationId } });
    if (!location) throw ApiException.notFound('Stock location');

    if (dto.purchaseId) {
      const purchase = await this.prisma.purchase.findUnique({
        where: { id: dto.purchaseId },
        include: { items: true },
      });
      if (!purchase) throw ApiException.notFound('Purchase');
      if (purchase.supplierId !== dto.supplierId) {
        throw ApiException.invalidTransaction('Return supplier does not match the original purchase supplier');
      }

      // Prevent over-returning: eligible quantity = purchased - already returned.
      for (const line of dto.items) {
        const purchasedQty = Number(
          purchase.items.find((i) => i.itemId === line.itemId)?.quantity ?? 0,
        );
        if (purchasedQty === 0) {
          throw ApiException.invalidTransaction(
            `Item was not part of the original purchase and cannot be returned on this reference`,
          );
        }
        const returnedQty = await this.prisma.purchaseReturnItem.aggregate({
          where: {
            itemId: line.itemId,
            purchaseReturn: { purchaseId: dto.purchaseId, status: 'posted' },
          },
          _sum: { quantity: true },
        });
        const eligible = purchasedQty - Number(returnedQty._sum.quantity ?? 0);
        if (line.quantity > eligible) {
          throw ApiException.invalidTransaction(
            `Cannot return more than the eligible quantity. Item available to return: ${eligible}, requested: ${line.quantity}.`,
          );
        }
      }

      // Validate location matches the purchase's receiving location for simplicity.
      if (purchase.stockLocationId !== dto.stockLocationId) {
        throw ApiException.invalidTransaction(
          'Return location must match the original purchase stock location',
        );
      }
    }

    const { subtotal, discount, tax, grandTotal } = computeTotals(dto.items, dto.discount, dto.tax);

    const number = await this.numbering.next('purchase_return', 'PR');

    const result = await this.prisma.runInTransaction(async (tx) => {
      const header = await tx.purchaseReturn.create({
        data: {
          number,
          returnDate: new Date(dto.returnDate),
          reference: dto.reference ?? null,
          note: dto.note ?? null,
          purchaseId: dto.purchaseId ?? null,
          supplierId: dto.supplierId,
          stockLocationId: dto.stockLocationId,
          subtotal,
          discount,
          tax,
          grandTotal,
          status: 'draft',
          createdById: actorId,
          items: {
            create: dto.items.map((item) => ({
              itemId: item.itemId,
              quantity: item.quantity,
              unitCost: item.unitCost,
              discount: item.discount ?? 0,
              tax: item.tax ?? 0,
              lineTotal: round2(item.quantity * item.unitCost - (item.discount ?? 0) + (item.tax ?? 0)),
            })),
          },
        },
        include: { items: true, supplier: true, stockLocation: true },
      });

      this.audit.record({
        userId: actorId,
        action: 'CREATE',
        module: 'PURCHASE_RETURN',
        entity: 'PurchaseReturn',
        entityId: header.id,
        message: `Purchase return ${number} created (${grandTotal})`,
      });
      return header;
    });
    return result;
  }

  async post(id: string, actorId?: string) {
    const pr = await this.prisma.purchaseReturn.findUnique({
      where: { id },
      include: { items: true, supplier: true, stockLocation: true },
    });
    if (!pr) throw ApiException.notFound('Purchase return');
    if (pr.status === 'posted') return pr;
    if (pr.status === 'cancelled') {
      throw ApiException.invalidTransaction('A cancelled purchase return cannot be posted');
    }
    await this.fiscal.assertOpen(pr.returnDate, 'Cannot post a purchase return');

    const inventoryAccountId =
      (await this.defaultAccounts.resolveAccount('accounting.inventory_account', 'Inventory')) ??
      undefined;
    const payableAccountId =
      pr.supplier.mainAccountId ??
      ((await this.defaultAccounts.resolveAccount('accounting.payable_account', 'Accounts Payable')) ??
        undefined);

    if (!inventoryAccountId || !payableAccountId) {
      throw ApiException.invalidTransaction('Accounting accounts are not configured');
    }

    const negativeSetting = await this.prisma.systemSetting.findFirst({
      where: { key: 'inventory.negative_stock' },
    });
    const allowNegative = negativeSetting?.value === 'true';

    const returnedTotal = round2(
      pr.items.reduce((s, i) => s + Number(i.quantity) * Number(i.unitCost), 0),
    );

    const result = await this.prisma.runInTransaction(async (tx) => {
      // 1. Reduce inventory for each line.
      for (const line of pr.items) {
        try {
          await this.inventory.recordOut(
            tx,
            {
              itemId: line.itemId,
              locationId: pr.stockLocationId,
              quantity: Number(line.quantity),
              transactionType: 'PURCHASE_RETURN',
              referenceType: 'PurchaseReturn',
              referenceId: pr.id,
              unitCost: Number(line.unitCost),
              createdById: actorId,
            },
            { allowNegative },
          );
        } catch (err) {
          if ((err as Error).message.startsWith('ERR_INSUFFICIENT_STOCK')) {
            const item = await this.prisma.item.findUnique({ where: { id: line.itemId } });
            const available = await this.inventory.getBalance(line.itemId, pr.stockLocationId, tx);
            throw ApiException.insufficientStock(
              item?.name ?? line.itemId,
              available,
              Number(line.quantity),
            );
          }
          throw err;
        }
      }

      // 2. Accounting: Dr Supplier/Payable, Cr Inventory (+ reverse of any
      //    purchase tax). Mirrors the purchase posting with the sides flipped:
      //    the payable is debited the document grand total, inventory is
      //    credited the gross returned cost, and the difference is the tax /
    //    discount adjustment that keeps the voucher balanced.
      const voucherEntries: VoucherEntryInput[] = [
        { mainAccountId: payableAccountId, debit: Number(pr.grandTotal), narration: `Purchase return ${pr.number}` },
        { mainAccountId: inventoryAccountId, credit: returnedTotal, narration: `Returned stock ${pr.number}` },
      ];

      const taxAmount = round2(Number(pr.grandTotal) - returnedTotal);
      if (taxAmount !== 0) {
        const taxAccountId = taxAmount < 0
          ? await this.defaultAccounts.resolveAccount('accounting.tax_account', 'Sales Tax Payable')
          : null;
        if (taxAccountId) {
          voucherEntries.push({
            mainAccountId: taxAccountId,
            ...(taxAmount < 0 ? { debit: -taxAmount } : { credit: taxAmount }),
            narration: `Purchase return tax ${pr.number}`,
          });
        } else {
          voucherEntries[1].credit = round2(Number(voucherEntries[1].credit) + taxAmount);
        }
      }

      const voucher = await this.accounting.createVoucher(
        tx,
        {
          voucherType: 'DEBIT',
          voucherDate: new Date(pr.returnDate),
          description: `Purchase return ${pr.number} - ${pr.supplier.name}`,
          reference: pr.number,
          entries: voucherEntries,
          createdById: actorId,
        },
        await this.numbering.next('voucher_purchase_return', 'DV', tx),
      );
      await this.accounting.postVoucher(tx, voucher.id, actorId);

      const updated = await tx.purchaseReturn.update({
        where: { id: pr.id },
        data: { status: 'posted' },
        include: { items: true },
      });

      this.audit.record({
        userId: actorId,
        action: 'POST',
        module: 'PURCHASE_RETURN',
        entity: 'PurchaseReturn',
        entityId: pr.id,
        message: `Purchase return ${pr.number} posted (${pr.grandTotal})`,
      });
      return updated;
    });
    return result;
  }

  async submit(id: string, actorId?: string) {
    const pr = await this.prisma.purchaseReturn.findUnique({ where: { id } });
    if (!pr) throw ApiException.notFound('Purchase return');
    if (pr.status === 'posted' || pr.status === 'cancelled') {
      throw ApiException.invalidTransaction(`A ${pr.status} purchase return cannot be submitted for approval`);
    }
    if (pr.status === 'pending') return pr;

    return this.prisma.purchaseReturn.update({
      where: { id },
      data: { status: 'pending', submittedById: actorId ?? null, submittedAt: new Date() },
    });
  }

  async reject(id: string, reason: string, actorId?: string) {
    const pr = await this.prisma.purchaseReturn.findUnique({ where: { id } });
    if (!pr) throw ApiException.notFound('Purchase return');
    if (pr.status !== 'pending') {
      throw ApiException.invalidTransaction(
        `Only pending purchase returns can be rejected. "${pr.number}" is ${pr.status}.`,
      );
    }
    const rejected = await this.prisma.purchaseReturn.update({
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
      module: 'PURCHASE_RETURN',
      entity: 'PurchaseReturn',
      entityId: id,
      message: `Purchase return ${pr.number} rejected`,
      metadata: { reason },
    });
    return rejected;
  }

  async update(id: string, dto: CreatePurchaseReturnDto, actorId?: string) {
    const pr = await this.prisma.purchaseReturn.findUnique({ where: { id } });
    if (!pr) throw ApiException.notFound('Purchase return');
    if (pr.status !== 'draft') {
      throw ApiException.invalidTransaction(
        `Only draft purchase returns can be edited. "${pr.number}" is ${pr.status}.`,
      );
    }
    await this.fiscal.assertOpen(dto.returnDate, 'Cannot update a purchase return');
    const supplier = await this.prisma.supplier.findUnique({ where: { id: dto.supplierId } });
    if (!supplier) throw ApiException.notFound('Supplier');
    const location = await this.prisma.stockLocation.findUnique({ where: { id: dto.stockLocationId } });
    if (!location) throw ApiException.notFound('Stock location');

    const { subtotal, discount, tax, grandTotal } = computeTotals(dto.items, dto.discount, dto.tax);

    const updated = await this.prisma.runInTransaction(async (tx) => {
      await tx.purchaseReturnItem.deleteMany({ where: { purchaseReturnId: id } });
      return tx.purchaseReturn.update({
        where: { id },
        data: {
          returnDate: new Date(dto.returnDate),
          reference: dto.reference ?? null,
          note: dto.note ?? null,
          purchaseId: dto.purchaseId ?? null,
          supplierId: dto.supplierId,
          stockLocationId: dto.stockLocationId,
          subtotal,
          discount,
          tax,
          grandTotal,
          items: {
            create: dto.items.map((item) => ({
              itemId: item.itemId,
              quantity: item.quantity,
              unitCost: item.unitCost,
              discount: item.discount ?? 0,
              tax: item.tax ?? 0,
              lineTotal: round2(item.quantity * item.unitCost - (item.discount ?? 0) + (item.tax ?? 0)),
            })),
          },
        },
        include: { items: true },
      });
    });
    this.audit.record({
      userId: actorId,
      action: 'UPDATE',
      module: 'PURCHASE_RETURN',
      entity: 'PurchaseReturn',
      entityId: id,
      message: `Purchase return ${pr.number} updated`,
    });
    return updated;
  }

  async remove(id: string, actorId?: string) {
    const pr = await this.prisma.purchaseReturn.findUnique({ where: { id } });
    if (!pr) throw ApiException.notFound('Purchase return');
    if (pr.status !== 'draft') {
      throw ApiException.invalidTransaction(
        `Only draft purchase returns can be deleted. "${pr.number}" is ${pr.status}.`,
      );
    }
    await this.fiscal.assertOpen(pr.returnDate, 'Cannot delete a purchase return');

    await this.prisma.runInTransaction(async (tx) => {
      await tx.purchaseReturn.delete({ where: { id } });
    });
    this.audit.record({
      userId: actorId,
      action: 'DELETE',
      module: 'PURCHASE_RETURN',
      entity: 'PurchaseReturn',
      entityId: id,
      message: `Purchase return ${pr.number} deleted`,
    });
    return { id, deleted: true };
  }

  async cancel(id: string, reason: string, actorId?: string) {
    const pr = await this.prisma.purchaseReturn.findUnique({ where: { id } });
    if (!pr) throw ApiException.notFound('Purchase return');
    await this.fiscal.assertOpen(pr.returnDate, 'Cannot cancel a purchase return');
    if (pr.status === 'posted') {
      throw ApiException.invalidTransaction(
        'Posted purchase returns cannot be cancelled. Create a reversal instead.',
      );
    }
    const result = await this.prisma.runInTransaction(async (tx) => {
      const updated = await tx.purchaseReturn.update({
        where: { id },
        data: { status: 'cancelled' },
      });
      this.audit.record({
        userId: actorId,
        action: 'CANCEL',
        module: 'PURCHASE_RETURN',
        entity: 'PurchaseReturn',
        entityId: id,
        message: `Purchase return ${pr.number} cancelled`,
        metadata: { reason },
      });
      return updated;
    });
    return result;
  }

  async findAll(query: { page?: number; pageSize?: number; search?: string; status?: string; supplierId?: string; from?: string; to?: string }) {
    const { page = 1, pageSize = 25, search, status, supplierId, from, to } = query;
    const where: Record<string, unknown> = {};
    if (search) {
      where.OR = [
        { number: { contains: search, mode: 'insensitive' } },
        { supplier: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }
    if (status) where.status = status;
    if (supplierId) where.supplierId = supplierId;
    if (from || to) {
      where.returnDate = dateRange(from, to);
    }

    const [items, total] = await Promise.all([
      this.prisma.purchaseReturn.findMany({
        where,
        include: { supplier: true, stockLocation: true, items: { include: { item: true } } },
        orderBy: { returnDate: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.purchaseReturn.count({ where }),
    ]);
    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async findOne(id: string) {
    const pr = await this.prisma.purchaseReturn.findUnique({
      where: { id },
      include: { supplier: true, stockLocation: true, items: { include: { item: true } }, purchase: true },
    });
    if (!pr) throw ApiException.notFound('Purchase return');
    return pr;
  }
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Header totals for a purchase return. The subtotal mirrors the stored
 * `lineTotal` of each line (net of the line discount, gross of the line tax)
 * so the document foots; header discount / tax are then applied on top.
 */
function computeTotals(items: any[], headerDiscount?: number, headerTax?: number) {
  const subtotal = round2(
    items.reduce((s, i) => s + i.quantity * i.unitCost - (i.discount ?? 0) + (i.tax ?? 0), 0),
  );
  const discount = round2(headerDiscount ?? 0);
  const tax = round2(headerTax ?? 0);
  return { subtotal, discount, tax, grandTotal: round2(subtotal - discount + tax) };
}