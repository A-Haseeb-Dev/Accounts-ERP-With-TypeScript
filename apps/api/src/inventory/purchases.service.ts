import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NumberingService } from '../common/services/numbering.service';
import { InventoryService } from '../common/services/inventory.service';
import { AccountingService, VoucherEntryInput } from '../common/services/accounting.service';
import { DefaultAccountsService } from '../common/services/default-accounts.service';
import { FiscalPeriodGuard } from '../common/services/fiscal-period.guard';
import { ApiException } from '../common/exceptions/api.exception';
import { Prisma } from '@prisma/client';
import { CreatePurchaseDto } from './dto/inventory.dto';

@Injectable()
export class PurchasesService {
  private readonly logger = new Logger(PurchasesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly numbering: NumberingService,
    private readonly inventory: InventoryService,
    private readonly accounting: AccountingService,
    private readonly defaultAccounts: DefaultAccountsService,
    private readonly fiscal: FiscalPeriodGuard,
  ) {}

  async create(dto: CreatePurchaseDto, actorId?: string) {
    await this.fiscal.assertOpen(dto.purchaseDate, 'Cannot create a purchase');
    const supplier = await this.prisma.supplier.findUnique({ where: { id: dto.supplierId } });
    if (!supplier) throw ApiException.notFound('Supplier');
    const location = await this.prisma.stockLocation.findUnique({ where: { id: dto.stockLocationId } });
    if (!location) throw ApiException.notFound('Stock location');

    const quantities = this.computeTotals(dto.items, dto.discount ?? 0, dto.tax ?? 0);

    const number = await this.numbering.next('purchase', 'PI');

    try {
      const purchase = await this.prisma.$transaction(async (tx) => {
        const header = await tx.purchase.create({
          data: {
            number,
            purchaseDate: new Date(dto.purchaseDate),
            reference: dto.reference ?? null,
            note: dto.note ?? null,
            supplierId: dto.supplierId,
            stockLocationId: dto.stockLocationId,
            subtotal: quantities.subtotal,
            discount: quantities.discount,
            tax: quantities.tax,
            grandTotal: quantities.grandTotal,
            status: 'draft',
            createdById: actorId,
            items: {
              create: dto.items.map((item) => ({
                itemId: item.itemId,
                quantity: item.quantity,
                unitCost: item.unitCost,
                discount: item.discount ?? 0,
                tax: item.tax ?? 0,
                lineTotal: round2(
                  item.quantity * item.unitCost - (item.discount ?? 0) + (item.tax ?? 0),
                ),
              })),
            },
          },
          include: { items: true, supplier: true, stockLocation: true },
        });

        this.audit.record({
          userId: actorId,
          action: 'CREATE',
          module: 'PURCHASE',
          entity: 'Purchase',
          entityId: header.id,
          message: `Purchase ${number} created for ${supplier.name} (${header.grandTotal})`,
        });

        return header;
      });
      return purchase;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw ApiException.duplicateCode(`Purchase number ${number} is already taken.`);
      }
      throw error;
    }
  }

  async post(id: string, actorId?: string) {
    const purchase = await this.prisma.purchase.findUnique({
      where: { id },
      include: { items: true, supplier: true, stockLocation: true },
    });
    if (!purchase) throw ApiException.notFound('Purchase');
    if (purchase.status === 'posted') return purchase;
    if (purchase.status === 'cancelled') {
      throw ApiException.invalidTransaction('A cancelled purchase cannot be posted');
    }
    await this.fiscal.assertOpen(purchase.purchaseDate, 'Cannot post a purchase');

    // Resolve accounting accounts.
    const inventoryAccountId =
      (await this.defaultAccounts.resolveAccount('accounting.inventory_account', 'Inventory')) ??
      undefined;
    const payableAccountId =
      supplierAccountId(purchase.supplier) ??
      ((await this.defaultAccounts.resolveAccount('accounting.payable_account', 'Accounts Payable')) ??
        undefined);

    if (!inventoryAccountId || !payableAccountId) {
      throw ApiException.invalidTransaction(
        'Accounting accounts are not configured (inventory / accounts payable). Set them in System Settings.',
      );
    }

    const inventoryTotal = round2(
      purchase.items.reduce((s, i) => s + Number(i.quantity) * Number(i.unitCost), 0),
    );

    // Negative inventory is controlled by a system setting.
    const negativeSetting = await this.prisma.systemSetting.findFirst({
      where: { key: 'inventory.negative_stock' },
    });
    const allowNegative = negativeSetting?.value === 'true';

    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Inventory in-transactions for each line.
      for (const line of purchase.items) {
        await this.inventory.recordIn(tx, {
          itemId: line.itemId,
          locationId: purchase.stockLocationId,
          quantity: Number(line.quantity),
          transactionType: 'PURCHASE',
          referenceType: 'Purchase',
          referenceId: purchase.id,
          unitCost: Number(line.unitCost),
          createdById: actorId,
        });
      }

      // 2. Accounting: Dr Inventory, Cr Supplier/Payable.
      const voucherEntries: VoucherEntryInput[] = [
        { mainAccountId: inventoryAccountId, debit: inventoryTotal, narration: `Purchase ${purchase.number}` },
        // Post the full grand total against supplier (or payable control).
        ...splitByParty({
          mainAccountId: payableAccountId,
          credit: Number(purchase.grandTotal),
          narration: `Purchase ${purchase.number}`,
        }),
      ];

      const voucher = await this.accounting.createVoucher(
        tx,
        {
          voucherType: 'CREDIT',
          voucherDate: purchase.purchaseDate,
          description: `Purchase ${purchase.number} - ${purchase.supplier.name}`,
          reference: purchase.number,
          entries: voucherEntries,
          createdById: actorId,
        },
        await this.numbering.next('voucher_purchase', 'PV', tx),
      );
      await this.accounting.postVoucher(tx, voucher.id, actorId);

      // 3. Mark purchase posted.
      const updated = await tx.purchase.update({
        where: { id: purchase.id },
        data: { status: 'posted', postedAt: new Date(), postedById: actorId },
        include: { items: true, supplier: true, stockLocation: true },
      });

      this.audit.record({
        userId: actorId,
        action: 'POST',
        module: 'PURCHASE',
        entity: 'Purchase',
        entityId: purchase.id,
        message: `Purchase ${purchase.number} posted (${purchase.grandTotal})`,
      });

      return updated;
    });
    return result;
  }

  async cancel(id: string, reason: string, actorId?: string) {
    const purchase = await this.prisma.purchase.findUnique({ where: { id } });
    if (!purchase) throw ApiException.notFound('Purchase');
    if (purchase.status === 'cancelled') return purchase;
    await this.fiscal.assertOpen(purchase.purchaseDate, 'Cannot cancel a purchase');
    if (purchase.status === 'posted') {
      throw ApiException.invalidTransaction(
        'Posted purchases cannot be cancelled. Use a purchase return to reverse the stock and liability.',
      );
    }

    const cancelled = await this.prisma.$transaction(async (tx) => {
      const result = await tx.purchase.update({
        where: { id },
        data: { status: 'cancelled', cancelReason: reason, cancelledAt: new Date() },
      });
      this.audit.record({
        userId: actorId,
        action: 'CANCEL',
        module: 'PURCHASE',
        entity: 'Purchase',
        entityId: id,
        message: `Purchase ${purchase.number} cancelled`,
        metadata: { reason },
      });
      return result;
    });
    return cancelled;
  }

  async findAll(query: {
    page?: number; pageSize?: number; search?: string; status?: string;
    supplierId?: string; from?: string; to?: string;
  }) {
    const { page = 1, pageSize = 25, search, status, supplierId, from, to } = query;
    const where: Record<string, unknown> = {};
    if (search) {
      where.OR = [
        { number: { contains: search, mode: 'insensitive' } },
        { reference: { contains: search, mode: 'insensitive' } },
        { supplier: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }
    if (status) where.status = status;
    if (supplierId) where.supplierId = supplierId;
    if (from || to) {
      where.purchaseDate = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      };
    }

    const [items, total] = await Promise.all([
      this.prisma.purchase.findMany({
        where,
        include: { supplier: true, stockLocation: true, items: { include: { item: true } }, _count: { select: { purchaseReturns: true } } },
        orderBy: { purchaseDate: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.purchase.count({ where }),
    ]);

    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async findOne(id: string) {
    const purchase = await this.prisma.purchase.findUnique({
      where: { id },
      include: {
        supplier: { include: { town: true } },
        stockLocation: true,
        items: { include: { item: true } },
        createdBy: { select: { id: true, fullName: true } },
        purchaseReturns: { include: { items: true } },
      },
    });
    if (!purchase) throw ApiException.notFound('Purchase');
    return purchase;
  }

  private computeTotals(items: any[], headerDiscount: number, headerTax: number) {
    const subtotal = round2(items.reduce((s, i) => s + i.quantity * i.unitCost, 0));
    const discount = round2(headerDiscount);
    const tax = round2(headerTax);
    const grandTotal = round2(subtotal - discount + tax);
    return { subtotal, discount, tax, grandTotal };
  }
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function supplierAccountId(supplier: any): string | null {
  return supplier.mainAccountId ?? null;
}

function splitByParty(entry: { mainAccountId: string; credit: number; narration?: string }) {
  return [{ mainAccountId: entry.mainAccountId, credit: entry.credit, narration: entry.narration }];
}