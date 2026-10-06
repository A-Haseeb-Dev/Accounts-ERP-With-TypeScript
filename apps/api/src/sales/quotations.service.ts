import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NumberingService } from '../common/services/numbering.service';
import { FiscalPeriodGuard } from '../common/services/fiscal-period.guard';
import { ApiException } from '../common/exceptions/api.exception';
import { CreateQuotationDto } from './dto/sales.dto';
import { dateRange } from '../common/utils/date-filter';

/**
 * Quotations are non-posting documents: a quotation never moves stock and never
 * touches the general ledger. It records an offer to a customer and can be
 * turned into a draft sales invoice, which is where stock and accounting
 * actually happen.
 *
 * Because there are no side effects, a quotation stays freely editable and
 * deletable in every status until it has been converted to an invoice.
 */
@Injectable()
export class QuotationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly numbering: NumberingService,
    private readonly fiscal: FiscalPeriodGuard,
  ) {}

  previewNumber() {
    return this.numbering.preview('quotation', 'QT');
  }

  async create(dto: CreateQuotationDto, actorId?: string) {
    await this.fiscal.assertOpen(dto.quotationDate, 'Cannot create a quotation');
    const customer = await this.prisma.customer.findUnique({ where: { id: dto.customerId } });
    if (!customer) throw ApiException.notFound('Customer');

    const itemIds = dto.items.map((i) => i.itemId);
    const items = await this.prisma.item.findMany({ where: { id: { in: itemIds } } });
    if (items.length !== new Set(itemIds).size) {
      throw ApiException.validation('One or more items were not found');
    }

    const validUntil = this.resolveValidUntil(dto);
    const totals = this.computeTotals(dto.items, dto.discount ?? 0, dto.tax ?? 0);
    const number = await this.numbering.next('quotation', 'QT');

    const quotation = await this.prisma.runInTransaction(async (tx) => {
      const header = await tx.quotation.create({
        data: {
          number,
          quotationDate: new Date(dto.quotationDate),
          validUntil,
          reference: dto.reference ?? null,
          note: dto.note ?? null,
          customerId: dto.customerId,
          subtotal: totals.subtotal,
          discount: totals.discount,
          tax: totals.tax,
          grandTotal: totals.grandTotal,
          status: 'draft',
          createdById: actorId,
          items: { create: dto.items.map((i) => this.lineData(i)) },
        },
        include: { items: true, customer: true },
      });

      this.audit.record({
        userId: actorId,
        action: 'CREATE',
        module: 'QUOTATION',
        entity: 'Quotation',
        entityId: header.id,
        message: `Quotation ${number} created for ${customer.name} (${header.grandTotal})`,
      });
      return header;
    });
    return quotation;
  }

  async update(id: string, dto: CreateQuotationDto, actorId?: string) {
    const quotation = await this.prisma.quotation.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!quotation) throw ApiException.notFound('Quotation');
    if (quotation.convertedSaleId) {
      throw ApiException.invalidTransaction(
        `"${quotation.number}" has already been converted to an invoice and can no longer be changed.`,
      );
    }
    await this.fiscal.assertOpen(dto.quotationDate, 'Cannot update a quotation');

    const customer = await this.prisma.customer.findUnique({ where: { id: dto.customerId } });
    if (!customer) throw ApiException.notFound('Customer');

    const itemIds = dto.items.map((i) => i.itemId);
    const items = await this.prisma.item.findMany({ where: { id: { in: itemIds } } });
    if (items.length !== new Set(itemIds).size) {
      throw ApiException.validation('One or more items were not found');
    }

    const validUntil = this.resolveValidUntil(dto);
    const totals = this.computeTotals(dto.items, dto.discount ?? 0, dto.tax ?? 0);

    const updated = await this.prisma.runInTransaction(async (tx) => {
      await tx.quotationItem.deleteMany({ where: { quotationId: id } });
      return tx.quotation.update({
        where: { id },
        data: {
          quotationDate: new Date(dto.quotationDate),
          validUntil,
          reference: dto.reference ?? null,
          note: dto.note ?? null,
          customerId: dto.customerId,
          subtotal: totals.subtotal,
          discount: totals.discount,
          tax: totals.tax,
          grandTotal: totals.grandTotal,
          items: { create: dto.items.map((i) => this.lineData(i)) },
        },
        include: { items: true, customer: true },
      });
    });

    this.audit.record({
      userId: actorId,
      action: 'UPDATE',
      module: 'QUOTATION',
      entity: 'Quotation',
      entityId: id,
      message: `Quotation ${quotation.number} updated`,
    });
    return updated;
  }

  /** Marks the offer as sent to the customer. Draft-only, and reversible. */
  async send(id: string, actorId?: string) {
    const quotation = await this.prisma.quotation.findUnique({ where: { id } });
    if (!quotation) throw ApiException.notFound('Quotation');
    this.assertNotConverted(quotation);
    if (quotation.status !== 'draft') {
      throw ApiException.invalidTransaction(
        `Only draft quotations can be sent. "${quotation.number}" is ${quotation.status}.`,
      );
    }

    const sent = await this.prisma.quotation.update({
      where: { id },
      data: { status: 'sent', sentAt: new Date(), decidedAt: null, decideReason: null },
    });
    this.audit.record({
      userId: actorId,
      action: 'SEND',
      module: 'QUOTATION',
      entity: 'Quotation',
      entityId: id,
      message: `Quotation ${quotation.number} sent to customer`,
    });
    return sent;
  }

  async accept(id: string, actorId?: string) {
    return this.decide(id, 'accepted', undefined, actorId);
  }

  async reject(id: string, reason: string, actorId?: string) {
    return this.decide(id, 'rejected', reason || 'Rejected by customer', actorId);
  }

  private async decide(
    id: string,
    status: 'accepted' | 'rejected',
    reason: string | undefined,
    actorId?: string,
  ) {
    const quotation = await this.prisma.quotation.findUnique({ where: { id } });
    if (!quotation) throw ApiException.notFound('Quotation');
    this.assertNotConverted(quotation);
    if (quotation.status === 'draft') {
      throw ApiException.invalidTransaction(
        `"${quotation.number}" has not been sent yet, so it cannot be marked ${status}.`,
      );
    }
    if (quotation.status !== 'sent') {
      throw ApiException.invalidTransaction(
        `Only sent quotations can be ${status}. "${quotation.number}" is ${quotation.status}.`,
      );
    }

    const decided = await this.prisma.quotation.update({
      where: { id },
      data: { status, decidedAt: new Date(), decideReason: reason ?? null },
    });
    this.audit.record({
      userId: actorId,
      action: status === 'accepted' ? 'ACCEPT' : 'REJECT',
      module: 'QUOTATION',
      entity: 'Quotation',
      entityId: id,
      message: `Quotation ${quotation.number} ${status}`,
      metadata: reason ? { reason } : undefined,
    });
    return decided;
  }

  /**
   * Turns an accepted quotation into a draft sales invoice carrying the same
   * customer, lines and totals. The invoice is left in draft so stock and
   * accounting are only affected when it is deliberately posted.
   */
  async convertToSale(
    id: string,
    body: { stockLocationId?: string; saleDate?: string } = {},
    actorId?: string,
  ) {
    const quotation = await this.prisma.quotation.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!quotation) throw ApiException.notFound('Quotation');
    if (quotation.convertedSaleId) {
      throw ApiException.invalidTransaction(
        `"${quotation.number}" has already been converted to an invoice.`,
      );
    }
    if (quotation.status !== 'accepted') {
      throw ApiException.invalidTransaction(
        `Only accepted quotations can be converted to an invoice. "${quotation.number}" is ${quotation.status}.`,
      );
    }

    const stockLocationId = body.stockLocationId ?? (await this.defaultStockLocationId());
    const saleDate = body.saleDate ? new Date(body.saleDate) : new Date();
    await this.fiscal.assertOpen(saleDate, 'Cannot create the sales invoice');

    const number = await this.numbering.next('sale', 'SI');

    const sale = await this.prisma.runInTransaction(async (tx) => {
      const created = await tx.sale.create({
        data: {
          number,
          saleDate,
          dueDate: null,
          reference: quotation.number,
          note: quotation.note ?? null,
          customerId: quotation.customerId,
          stockLocationId,
          subtotal: quotation.subtotal,
          discount: quotation.discount,
          tax: quotation.tax,
          grandTotal: quotation.grandTotal,
          paymentStatus: 'unpaid',
          amountPaid: 0,
          status: 'draft',
          createdById: actorId,
          items: {
            create: quotation.items.map((line: any) => ({
              itemId: line.itemId,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              discount: line.discount,
              tax: line.tax,
              lineTotal: line.lineTotal,
            })),
          },
        },
        include: { items: true, customer: true },
      });

      await tx.quotation.update({
        where: { id },
        data: { convertedSaleId: created.id },
      });

      this.audit.record({
        userId: actorId,
        action: 'CONVERT',
        module: 'QUOTATION',
        entity: 'Quotation',
        entityId: id,
        message: `Quotation ${quotation.number} converted to sales invoice ${number}`,
      });
      return created;
    });

    return { sale, quotationId: id };
  }

  async remove(id: string, actorId?: string) {
    const quotation = await this.prisma.quotation.findUnique({ where: { id } });
    if (!quotation) throw ApiException.notFound('Quotation');
    if (quotation.convertedSaleId) {
      throw ApiException.invalidTransaction(
        `"${quotation.number}" has already been converted to an invoice. Delete the invoice first.`,
      );
    }
    await this.prisma.quotation.delete({ where: { id } });
    this.audit.record({
      userId: actorId,
      action: 'DELETE',
      module: 'QUOTATION',
      entity: 'Quotation',
      entityId: id,
      message: `Quotation ${quotation.number} deleted`,
    });
    return { id, deleted: true };
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
      where.quotationDate = dateRange(from, to);
    }

    const [items, total] = await Promise.all([
      this.prisma.quotation.findMany({
        where,
        include: {
          customer: true,
          items: { include: { item: true } },
          convertedSale: { select: { id: true, number: true, status: true } },
        },
        orderBy: { quotationDate: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.quotation.count({ where }),
    ]);
    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async findOne(id: string) {
    const quotation = await this.prisma.quotation.findUnique({
      where: { id },
      include: {
        customer: { include: { town: true } },
        items: { include: { item: true } },
        createdBy: { select: { id: true, fullName: true } },
        convertedSale: { select: { id: true, number: true, status: true } },
      },
    });
    if (!quotation) throw ApiException.notFound('Quotation');
    return quotation;
  }

  /** Pick the quote's own valid-until date, else a sensible 30-day window. */
  private resolveValidUntil(dto: CreateQuotationDto): Date | null {
    if (dto.validUntil) return new Date(dto.validUntil);
    const fallback = new Date(dto.quotationDate);
    fallback.setDate(fallback.getDate() + 30);
    return fallback;
  }

  private lineData(i: { itemId: string; quantity: number; unitPrice: number; discount?: number; tax?: number }) {
    return {
      itemId: i.itemId,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      discount: i.discount ?? 0,
      tax: i.tax ?? 0,
      lineTotal: round2(i.quantity * i.unitPrice - (i.discount ?? 0) + (i.tax ?? 0)),
    };
  }

  private assertNotConverted(quotation: { number: string; convertedSaleId: string | null }) {
    if (quotation.convertedSaleId) {
      throw ApiException.invalidTransaction(
        `"${quotation.number}" has already been converted to an invoice and can no longer be changed.`,
      );
    }
  }

  private async defaultStockLocationId(): Promise<string> {
    const location =
      (await this.prisma.stockLocation.findFirst({ where: { status: 'active' }, orderBy: { code: 'asc' } })) ??
      (await this.prisma.stockLocation.findFirst({ orderBy: { code: 'asc' } }));
    if (!location) {
      throw ApiException.invalidTransaction(
        'No stock location is available, so the sales invoice cannot be created. Please create a stock location first.',
      );
    }
    return location.id;
  }

  private computeTotals(items: any[], headerDiscount: number, headerTax: number) {
    const subtotal = round2(
      items.reduce((s, i) => s + i.quantity * i.unitPrice - (i.discount ?? 0) + (i.tax ?? 0), 0),
    );
    const discount = round2(headerDiscount);
    const tax = round2(headerTax);
    // A header discount larger than the quotation turns grandTotal negative;
    // the DTO only bounds `discount` at >= 0, so nothing else stopped it.
    const beforeDiscount = round2(subtotal + tax);
    if (discount > beforeDiscount) {
      throw ApiException.validation(
        `The discount (${discount}) cannot exceed the quotation total before discount (${beforeDiscount}).`,
      );
    }
    const grandTotal = round2(subtotal - discount + tax);
    return { subtotal, discount, tax, grandTotal };
  }
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
