import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NumberingService } from '../common/services/numbering.service';
import { InventoryService } from '../common/services/inventory.service';
import { AccountingService } from '../common/services/accounting.service';
import { DefaultAccountsService } from '../common/services/default-accounts.service';
import { FiscalPeriodGuard } from '../common/services/fiscal-period.guard';
import { ApiException } from '../common/exceptions/api.exception';
import { CreatePurchaseReturnDto } from './dto/inventory.dto';

@Injectable()
export class PurchaseReturnsService {
  private readonly logger = new Logger(PurchaseReturnsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly numbering: NumberingService,
    private readonly inventory: InventoryService,
    private readonly accounting: AccountingService,
    private readonly defaultAccounts: DefaultAccountsService,
    private readonly fiscal: FiscalPeriodGuard,
  ) {}

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

    const subtotal = round2(dto.items.reduce((s, i) => s + i.quantity * i.unitCost, 0));
    const discount = round2(dto.discount ?? 0);
    const tax = round2(dto.tax ?? 0);
    const grandTotal = round2(subtotal - discount + tax);

    const number = await this.numbering.next('purchase_return', 'PR');

    const result = await this.prisma.$transaction(async (tx) => {
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

    const result = await this.prisma.$transaction(async (tx) => {
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

      // 2. Accounting: Dr Supplier/Payable, Cr Inventory.
      const voucher = await this.accounting.createVoucher(
        tx,
        {
          voucherType: 'DEBIT',
          voucherDate: new Date(pr.returnDate),
          description: `Purchase return ${pr.number} - ${pr.supplier.name}`,
          reference: pr.number,
          entries: [
            { mainAccountId: payableAccountId, debit: Number(pr.grandTotal), narration: `Purchase return ${pr.number}` },
            { mainAccountId: inventoryAccountId, credit: returnedTotal, narration: `Returned stock ${pr.number}` },
          ],
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

  async cancel(id: string, reason: string, actorId?: string) {
    const pr = await this.prisma.purchaseReturn.findUnique({ where: { id } });
    if (!pr) throw ApiException.notFound('Purchase return');
    await this.fiscal.assertOpen(pr.returnDate, 'Cannot cancel a purchase return');
    if (pr.status === 'posted') {
      throw ApiException.invalidTransaction(
        'Posted purchase returns cannot be cancelled. Create a reversal instead.',
      );
    }
    const result = await this.prisma.$transaction(async (tx) => {
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
      where.returnDate = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      };
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