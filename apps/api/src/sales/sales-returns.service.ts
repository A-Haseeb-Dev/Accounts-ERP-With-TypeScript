import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NumberingService } from '../common/services/numbering.service';
import { InventoryService } from '../common/services/inventory.service';
import { AccountingService } from '../common/services/accounting.service';
import { DefaultAccountsService } from '../common/services/default-accounts.service';
import { FiscalPeriodGuard } from '../common/services/fiscal-period.guard';
import { ApiException } from '../common/exceptions/api.exception';
import { CreateSalesReturnDto } from './dto/sales.dto';

@Injectable()
export class SalesReturnsService {
  private readonly logger = new Logger(SalesReturnsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly numbering: NumberingService,
    private readonly inventory: InventoryService,
    private readonly accounting: AccountingService,
    private readonly defaultAccounts: DefaultAccountsService,
    private readonly fiscal: FiscalPeriodGuard,
  ) {}

  async create(dto: CreateSalesReturnDto, actorId?: string) {
    await this.fiscal.assertOpen(dto.returnDate, 'Cannot create a sales return');
    const customer = await this.prisma.customer.findUnique({ where: { id: dto.customerId } });
    if (!customer) throw ApiException.notFound('Customer');
    const location = await this.prisma.stockLocation.findUnique({ where: { id: dto.stockLocationId } });
    if (!location) throw ApiException.notFound('Stock location');

    if (dto.saleId) {
      const sale = await this.prisma.sale.findUnique({
        where: { id: dto.saleId },
        include: { items: true },
      });
      if (!sale) throw ApiException.notFound('Sales invoice');
      if (sale.customerId !== dto.customerId) {
        throw ApiException.invalidTransaction('Return customer does not match the original invoice customer');
      }
      // Prevent over-returning: eligible = sold - already returned.
      for (const line of dto.items) {
        const soldQty = Number(sale.items.find((i) => i.itemId === line.itemId)?.quantity ?? 0);
        if (soldQty === 0) {
          throw ApiException.invalidTransaction('Item was not part of the original invoice and cannot be returned');
        }
        const returnedQty = await this.prisma.salesReturnItem.aggregate({
          where: { itemId: line.itemId, salesReturn: { saleId: dto.saleId, status: 'posted' } },
          _sum: { quantity: true },
        });
        const eligible = soldQty - Number(returnedQty._sum.quantity ?? 0);
        if (line.quantity > eligible) {
          throw ApiException.invalidTransaction(
            `Cannot return more than the eligible quantity. Item available to return: ${eligible}, requested: ${line.quantity}.`,
          );
        }
      }
      if (sale.stockLocationId !== dto.stockLocationId) {
        throw ApiException.invalidTransaction('Return location must match the original sale stock location');
      }
    }

    const subtotal = round2(dto.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0));
    const grandTotal = round2(subtotal);

    const number = await this.numbering.next('sales_return', 'SR');

    const result = await this.prisma.$transaction(async (tx) => {
      const header = await tx.salesReturn.create({
        data: {
          number,
          returnDate: new Date(dto.returnDate),
          reference: dto.reference ?? null,
          note: dto.note ?? null,
          saleId: dto.saleId ?? null,
          customerId: dto.customerId,
          stockLocationId: dto.stockLocationId,
          subtotal,
          discount: 0,
          tax: 0,
          grandTotal,
          status: 'draft',
          createdById: actorId,
          items: {
            create: dto.items.map((item) => ({
              itemId: item.itemId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              discount: 0,
              tax: 0,
              lineTotal: round2(item.quantity * item.unitPrice),
            })),
          },
        },
        include: { items: true, customer: true, stockLocation: true },
      });

      this.audit.record({
        userId: actorId,
        action: 'CREATE',
        module: 'SALES_RETURN',
        entity: 'SalesReturn',
        entityId: header.id,
        message: `Sales return ${number} created (${grandTotal})`,
      });
      return header;
    });
    return result;
  }

  async post(id: string, actorId?: string) {
    const sr = await this.prisma.salesReturn.findUnique({
      where: { id },
      include: { items: true, customer: true, stockLocation: true },
    });
    if (!sr) throw ApiException.notFound('Sales return');
    if (sr.status === 'posted') return sr;
    if (sr.status === 'cancelled') {
      throw ApiException.invalidTransaction('A cancelled sales return cannot be posted');
    }
    await this.fiscal.assertOpen(sr.returnDate, 'Cannot post a sales return');

    const salesReturnAccountId =
      (await this.defaultAccounts.resolveAccount('accounting.sales_return_account', 'Sales Returns')) ??
      undefined;
    const customerAccountId =
      sr.customer.mainAccountId ??
      ((await this.defaultAccounts.resolveAccount('accounting.receivable_account', 'Accounts Receivable')) ??
        undefined);

    if (!salesReturnAccountId || !customerAccountId) {
      throw ApiException.invalidTransaction('Accounting accounts are not configured');
    }

    const productTotal = Number(sr.grandTotal);

    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Restore inventory for each line.
      for (const line of sr.items) {
        await this.inventory.recordIn(tx, {
          itemId: line.itemId,
          locationId: sr.stockLocationId,
          quantity: Number(line.quantity),
          transactionType: 'SALES_RETURN',
          referenceType: 'SalesReturn',
          referenceId: sr.id,
          unitCost: Number(line.unitPrice),
          createdById: actorId,
        });
      }

      // 2. Accounting: Dr Sales Returns, Cr Customer/Receivable.
      const voucher = await this.accounting.createVoucher(
        tx,
        {
          voucherType: 'JOURNAL',
          voucherDate: new Date(sr.returnDate),
          description: `Sales return ${sr.number} - ${sr.customer.name}`,
          reference: sr.number,
          entries: [
            { mainAccountId: salesReturnAccountId, debit: productTotal, narration: `Return ${sr.number}` },
            { mainAccountId: customerAccountId, credit: productTotal, narration: `Return ${sr.number}` },
          ],
          createdById: actorId,
        },
        await this.numbering.next('voucher_sales_return', 'RS', tx),
      );
      await this.accounting.postVoucher(tx, voucher.id, actorId);

      const updated = await tx.salesReturn.update({
        where: { id: sr.id },
        data: { status: 'posted' },
        include: { items: true },
      });

      this.audit.record({
        userId: actorId,
        action: 'POST',
        module: 'SALES_RETURN',
        entity: 'SalesReturn',
        entityId: sr.id,
        message: `Sales return ${sr.number} posted (${sr.grandTotal})`,
      });
      return updated;
    });
    return result;
  }

  async cancel(id: string, reason: string, actorId?: string) {
    const sr = await this.prisma.salesReturn.findUnique({ where: { id } });
    if (!sr) throw ApiException.notFound('Sales return');
    await this.fiscal.assertOpen(sr.returnDate, 'Cannot cancel a sales return');
    if (sr.status === 'posted') {
      throw ApiException.invalidTransaction(
        'Posted sales returns cannot be cancelled. Create a reversal instead.',
      );
    }
    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.salesReturn.update({ where: { id }, data: { status: 'cancelled' } });
      this.audit.record({
        userId: actorId,
        action: 'CANCEL',
        module: 'SALES_RETURN',
        entity: 'SalesReturn',
        entityId: id,
        message: `Sales return ${sr.number} cancelled`,
        metadata: { reason },
      });
      return updated;
    });
    return result;
  }

  async findAll(query: { page?: number; pageSize?: number; search?: string; status?: string; customerId?: string; from?: string; to?: string }) {
    const { page = 1, pageSize = 25, search, status, customerId, from, to } = query;
    const where: Record<string, unknown> = {};
    if (search) {
      where.OR = [
        { number: { contains: search, mode: 'insensitive' } },
        { customer: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }
    if (status) where.status = status;
    if (customerId) where.customerId = customerId;
    if (from || to) {
      where.returnDate = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      };
    }

    const [items, total] = await Promise.all([
      this.prisma.salesReturn.findMany({
        where,
        include: { customer: true, stockLocation: true, items: { include: { item: true } } },
        orderBy: { returnDate: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.salesReturn.count({ where }),
    ]);
    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async findOne(id: string) {
    const sr = await this.prisma.salesReturn.findUnique({
      where: { id },
      include: { customer: true, stockLocation: true, items: { include: { item: true } }, sale: true },
    });
    if (!sr) throw ApiException.notFound('Sales return');
    return sr;
  }
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}