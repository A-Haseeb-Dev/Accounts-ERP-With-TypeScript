import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NumberingService } from '../common/services/numbering.service';
import { AccountingService, VoucherEntryInput } from '../common/services/accounting.service';
import { DefaultAccountsService } from '../common/services/default-accounts.service';
import { FiscalPeriodGuard } from '../common/services/fiscal-period.guard';
import { ApiException } from '../common/exceptions/api.exception';
import { CreatePaymentDto } from './dto/payments.dto';

const DOC_PREFIXES: Record<string, string> = { RECEIPT: 'RN', PAYMENT: 'PN' };

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly numbering: NumberingService,
    private readonly accounting: AccountingService,
    private readonly defaultAccounts: DefaultAccountsService,
    private readonly fiscal: FiscalPeriodGuard,
  ) {}

  previewNumber(paymentType?: string) {
    const type = (paymentType ?? 'RECEIPT').toUpperCase();
    return this.numbering.preview(
      type === 'RECEIPT' ? 'payment_receipt' : 'payment_payment',
      DOC_PREFIXES[type] ?? 'RN',
    );
  }

  async create(dto: CreatePaymentDto, actorId?: string) {
    await this.fiscal.assertOpen(
      new Date(dto.paymentDate ?? new Date()),
      'Cannot create a payment entry',
    );
    const usable = Number(dto.amount ?? 0);
    if (usable <= 0) throw ApiException.validation('Amount must be greater than zero');

    const account = await this.prisma.mainAccount.findUnique({
      where: { id: dto.mainAccountId },
    });
    if (!account) throw ApiException.notFound('Main account');

    const party =
      dto.partyType === 'CUSTOMER'
        ? await this.prisma.customer.findUnique({ where: { id: dto.partyId } })
        : await this.prisma.supplier.findUnique({ where: { id: dto.partyId } });
    if (!party) throw ApiException.notFound(dto.partyType === 'CUSTOMER' ? 'Customer' : 'Supplier');

    const allocations = (dto.allocations ?? []).filter(
      (a) => Number(a.allocatedAmount ?? 0) > 0,
    );
    const allocatedTotal = round2(
      allocations.reduce((s, a) => s + Number(a.allocatedAmount ?? 0), 0),
    );
    if (allocatedTotal > usable) {
      throw ApiException.validation('Allocated amounts cannot exceed the payment amount');
    }

    for (const a of allocations) {
      if (a.documentType === 'SALE') {
        const doc = await this.prisma.sale.findUnique({ where: { id: a.documentId } });
        if (!doc || doc.customerId !== dto.partyId) {
          throw ApiException.validation('Sale allocation does not belong to this customer');
        }
        if (doc.status !== 'posted') {
          throw ApiException.validation('Only posted sales can be allocated');
        }
        const returned = await this.prisma.salesReturn.aggregate({
          where: { saleId: doc.id, status: 'posted' },
          _sum: { grandTotal: true },
        });
        const outstanding = round2(
          Math.max(0, Number(doc.grandTotal) - Number(doc.amountPaid) - Number(returned._sum.grandTotal ?? 0)),
        );
        if (Number(a.allocatedAmount) > outstanding) {
          throw ApiException.validation(
            `Allocation ${Number(a.allocatedAmount)} exceeds outstanding ${outstanding} on invoice ${doc.number}`,
          );
        }
      } else if (a.documentType === 'PURCHASE') {
        const doc = await this.prisma.purchase.findUnique({ where: { id: a.documentId } });
        if (!doc || doc.supplierId !== dto.partyId) {
          throw ApiException.validation('Purchase allocation does not belong to this supplier');
        }
        if (doc.status !== 'posted') {
          throw ApiException.validation('Only posted purchases can be allocated');
        }
        const returned = await this.prisma.purchaseReturn.aggregate({
          where: { purchaseId: doc.id, status: 'posted' },
          _sum: { grandTotal: true },
        });
        const outstanding = round2(
          Math.max(0, Number(doc.grandTotal) - Number(doc.paidAmount) - Number(returned._sum.grandTotal ?? 0)),
        );
        if (Number(a.allocatedAmount) > outstanding) {
          throw ApiException.validation(
            `Allocation ${Number(a.allocatedAmount)} exceeds outstanding ${outstanding} on purchase ${doc.number}`,
          );
        }
      } else {
        throw ApiException.validation('Allocations are only supported against SALE and PURCHASE documents');
      }
    }

    const paymentType = dto.paymentType.toUpperCase();
    const number = await this.numbering.next(
      paymentType === 'RECEIPT' ? 'payment_receipt' : 'payment_payment',
      DOC_PREFIXES[paymentType] ?? 'RN',
    );

    try {
      const entry = await this.prisma.paymentEntry.create({
        data: {
          number,
          paymentType,
          partyType: dto.partyType,
          partyId: dto.partyId,
          partyName: party.name,
          mainAccountId: dto.mainAccountId,
          method: (dto.method ?? 'CASH').toUpperCase(),
          chequeNumber: dto.chequeNumber ?? null,
          amount: usable,
          paymentDate: new Date(dto.paymentDate ?? new Date()),
          reference: dto.reference ?? null,
          narration: dto.narration ?? null,
          status: 'pending',
          createdById: actorId,
          allocations: {
            create: allocations.map((a) => ({
              documentType: a.documentType,
              documentId: a.documentId,
              allocatedAmount: Number(a.allocatedAmount),
            })),
          },
        },
        include: { allocations: true, mainAccount: true },
      });

      this.audit.record({
        userId: actorId,
        action: 'CREATE',
        module: 'PAYMENT',
        entity: 'PaymentEntry',
        entityId: entry.id,
        message: `Payment ${number} created (${paymentType} ${usable}) for ${party.name}`,
      });

      return entry;
    } catch (error) {
      if (error instanceof ApiException) throw error;
      throw error;
    }
  }

  async post(id: string, actorId?: string) {
    const entry = await this.prisma.paymentEntry.findUnique({
      where: { id },
      include: { allocations: true },
    });
    if (!entry) throw ApiException.notFound('Payment entry');
    if (entry.status === 'posted') return entry;
    if (entry.status === 'cancelled') {
      throw ApiException.invalidTransaction('A cancelled payment entry cannot be posted');
    }
    await this.fiscal.assertOpen(entry.paymentDate, 'Cannot post a payment entry');

    const partyAccount =
      entry.partyType === 'CUSTOMER'
        ? (
            await this.prisma.customer.findUnique({
              where: { id: entry.partyId },
              select: { mainAccountId: true },
            })
          )?.mainAccountId ??
          (await this.defaultAccounts.resolveAccount('accounting.receivable_account', 'Accounts Receivable'))
        : (
            await this.prisma.supplier.findUnique({
              where: { id: entry.partyId },
              select: { mainAccountId: true },
            })
          )?.mainAccountId ??
          (await this.defaultAccounts.resolveAccount('accounting.payable_account', 'Accounts Payable'));

    if (!partyAccount) {
      throw ApiException.invalidTransaction(
        'Party is not linked to an account and the control account is not configured',
      );
    }

    const amount = Number(entry.amount);
    const isReceipt = entry.paymentType === 'RECEIPT';
    const voucherType = isReceipt ? 'DEBIT' : 'CREDIT';
    const voucherSettingKey = isReceipt ? 'voucher_receipt' : 'voucher_payment';
    const voucherPrefix = isReceipt ? 'RV' : 'PY';

    const result = await this.prisma.runInTransaction(async (tx) => {
      const voucherEntries: VoucherEntryInput[] = isReceipt
        ? [
            {
              mainAccountId: entry.mainAccountId,
              debit: amount,
              narration: `${entry.partyName} - ${entry.number}`,
            },
            {
              mainAccountId: partyAccount,
              credit: amount,
              narration: `${entry.partyName} - ${entry.number}`,
            },
          ]
        : [
            {
              mainAccountId: partyAccount,
              debit: amount,
              narration: `${entry.partyName} - ${entry.number}`,
            },
            {
              mainAccountId: entry.mainAccountId,
              credit: amount,
              narration: `${entry.partyName} - ${entry.number}`,
            },
          ];

      const voucher = await this.accounting.createVoucher(
        tx,
        {
          voucherType: voucherType as any,
          voucherDate: entry.paymentDate,
          description: `${isReceipt ? 'Receipt' : 'Payment'} ${entry.number} - ${entry.partyName}`,
          reference: entry.number,
          entries: voucherEntries,
          createdById: actorId,
        },
        await this.numbering.next(voucherSettingKey, voucherPrefix, tx),
      );
      await this.accounting.postVoucher(tx, voucher.id, actorId);

      for (const a of entry.allocations) {
        const amt = Number(a.allocatedAmount);
        if (a.documentType === 'SALE') {
          const sale = await tx.sale.findUnique({ where: { id: a.documentId } });
          if (sale) {
            const paid = round2(Number(sale.amountPaid) + amt);
            const paymentStatus =
              paid >= Number(sale.grandTotal) ? 'paid' : paid > 0 ? 'partial' : 'unpaid';
            await tx.sale.update({
              where: { id: sale.id },
              data: { amountPaid: paid, paymentStatus },
            });
          }
        } else if (a.documentType === 'PURCHASE') {
          const purchase = await tx.purchase.findUnique({ where: { id: a.documentId } });
          if (purchase) {
            const paid = round2(Number(purchase.paidAmount) + amt);
            const payStatus =
              paid >= Number(purchase.grandTotal) ? 'paid' : paid > 0 ? 'partial' : 'unpaid';
            await tx.purchase.update({
              where: { id: purchase.id },
              data: { paidAmount: paid, payStatus },
            });
          }
        }
      }

      const updated = await tx.paymentEntry.update({
        where: { id },
        data: {
          status: 'posted',
          voucherId: voucher.id,
          postedById: actorId,
          postedAt: new Date(),
        },
        include: { allocations: true },
      });

      this.audit.record({
        userId: actorId,
        action: 'POST',
        module: 'PAYMENT',
        entity: 'PaymentEntry',
        entityId: id,
        message: `Payment ${entry.number} posted (${amount})`,
      });

      return updated;
    });
    return result;
  }

  async cancel(id: string, reason: string, actorId?: string) {
    const entry = await this.prisma.paymentEntry.findUnique({ where: { id } });
    if (!entry) throw ApiException.notFound('Payment entry');
    if (entry.status === 'cancelled') return entry;
    await this.fiscal.assertOpen(entry.paymentDate, 'Cannot cancel a payment entry');
    if (entry.status === 'posted') {
      throw ApiException.invalidTransaction(
        'Posted payments cannot be cancelled. Post a reversing payment instead.',
      );
    }

    const cancelled = await this.prisma.paymentEntry.update({
      where: { id },
      data: {
        status: 'cancelled',
        cancelledById: actorId,
        cancelledAt: new Date(),
        cancelReason: reason,
      },
    });
    this.audit.record({
      userId: actorId,
      action: 'CANCEL',
      module: 'PAYMENT',
      entity: 'PaymentEntry',
      entityId: id,
      message: `Payment ${entry.number} cancelled`,
      metadata: { reason },
    });
    return cancelled;
  }

  async findAll(query: {
    page?: number;
    pageSize?: number;
    search?: string;
    status?: string;
    paymentType?: string;
    partyType?: string;
    partyId?: string;
    from?: string;
    to?: string;
  }) {
    const { page = 1, pageSize = 25, search, status, paymentType, partyType, partyId, from, to } = query;
    const where: Record<string, unknown> = {};
    if (search) {
      where.OR = [
        { number: { contains: search, mode: 'insensitive' } },
        { partyName: { contains: search, mode: 'insensitive' } },
        { reference: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (status) where.status = status;
    if (paymentType) where.paymentType = paymentType;
    if (partyType) where.partyType = partyType;
    if (partyId) where.partyId = partyId;
    if (from || to) {
      where.paymentDate = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      };
    }

    const [items, total] = await Promise.all([
      this.prisma.paymentEntry.findMany({
        where,
        include: { mainAccount: true, allocations: true },
        orderBy: { paymentDate: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.paymentEntry.count({ where }),
    ]);
    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async findOne(id: string) {
    const entry = await this.prisma.paymentEntry.findUnique({
      where: { id },
      include: { mainAccount: true, allocations: true },
    });
    if (!entry) throw ApiException.notFound('Payment entry');
    return entry;
  }

  async openInvoices(partyType: string, partyId: string) {
    if (partyType === 'CUSTOMER') {
      const sales = await this.prisma.sale.findMany({
        where: { customerId: partyId, status: 'posted' },
        include: {
          salesReturns: { where: { status: 'posted' }, select: { grandTotal: true } },
        },
        orderBy: { saleDate: 'desc' },
      });
      return sales
        .map((s) => {
          const returned = s.salesReturns.reduce((x, r) => x + Number(r.grandTotal), 0);
          const outstanding = round2(
            Math.max(0, Number(s.grandTotal) - Number(s.amountPaid) - returned),
          );
          return {
            documentType: 'SALE' as const,
            documentId: s.id,
            number: s.number,
            date: s.saleDate,
            customerName: null,
            total: Number(s.grandTotal),
            paid: Number(s.amountPaid),
            outstanding,
          };
        })
        .filter((x) => x.outstanding > 0);
    }

    const purchases = await this.prisma.purchase.findMany({
      where: { supplierId: partyId, status: 'posted' },
      include: {
        purchaseReturns: { where: { status: 'posted' }, select: { grandTotal: true } },
      },
      orderBy: { purchaseDate: 'desc' },
    });
    return purchases
      .map((p) => {
        const returned = p.purchaseReturns.reduce((x, r) => x + Number(r.grandTotal), 0);
        const outstanding = round2(
          Math.max(0, Number(p.grandTotal) - Number(p.paidAmount) - returned),
        );
        return {
          documentType: 'PURCHASE' as const,
          documentId: p.id,
          number: p.number,
          date: p.purchaseDate,
          supplierName: null,
          total: Number(p.grandTotal),
          paid: Number(p.paidAmount),
          outstanding,
        };
      })
      .filter((x) => x.outstanding > 0);
  }
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
