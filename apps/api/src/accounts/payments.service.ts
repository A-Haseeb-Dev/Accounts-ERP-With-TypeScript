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

    if (dto.mainAccountId) {
      const account = await this.prisma.mainAccount.findUnique({
        where: { id: dto.mainAccountId },
      });
      if (!account) throw ApiException.notFound('Main account');
    }

    const party =
      dto.partyType === 'CUSTOMER'
        ? await this.prisma.customer.findUnique({ where: { id: dto.partyId } })
        : await this.prisma.supplier.findUnique({ where: { id: dto.partyId } });
    if (!party) throw ApiException.notFound(dto.partyType === 'CUSTOMER' ? 'Customer' : 'Supplier');

    const method = (dto.method ?? 'CASH').toUpperCase();
    if (method === 'CHEQUE' && !dto.chequeNumber?.trim()) {
      throw ApiException.validation('Cheque number is required for cheque payments');
    }
    const chequeDate = dto.chequeDate ? new Date(dto.chequeDate) : null;
    const paymentType = dto.paymentType.toUpperCase();
    const isReceipt = paymentType === 'RECEIPT';
    // Post-dated cheques are held in holding accounts until they mature:
    //  - Cheque RECEIVED -> Dr PDC account / Cr party (asset)
    //  - Cheque ISSUED   -> Dr Supplier / Cr "Cheques Issued" (liability)
    const isPdc = method === 'CHEQUE' && !!chequeDate;
    const resolvedPdcAccount = isPdc
      ? isReceipt
        ? await this.resolvePdcAccount(dto, party)
        : await this.resolveChequeIssuedAccount()
      : null;

    let bankAccountId: string | null = null;
    if (method === 'CHEQUE') {
      const requireBank = !(isPdc && isReceipt);
      if (requireBank) {
        if (!dto.bankAccountId) {
          throw ApiException.validation('Select the bank account for the cheque');
        }
        const bank = await this.prisma.bankAccount.findUnique({
          where: { id: dto.bankAccountId },
        });
        if (!bank) throw ApiException.notFound('Bank account');
        bankAccountId = bank.id;
      } else if (dto.bankAccountId) {
        const bank = await this.prisma.bankAccount.findUnique({
          where: { id: dto.bankAccountId },
        });
        if (!bank) throw ApiException.notFound('Bank account');
        bankAccountId = bank.id;
      }
    }
    if (!isPdc && !dto.mainAccountId) {
      throw ApiException.validation('Select the cash / bank account for this entry');
    }

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
          mainAccountId: isPdc ? (resolvedPdcAccount?.id ?? dto.mainAccountId ?? '') : (dto.mainAccountId ?? ''),
          method,
          chequeNumber: dto.chequeNumber ?? null,
          bankAccountId,
          pdcAccountId: isPdc && isReceipt ? (resolvedPdcAccount?.id ?? null) : null,
          chequeDate,
          chequeStatus: isPdc ? 'PENDING' : null,
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
        include: { allocations: true, mainAccount: true, bankAccount: true },
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

    const partyAccount = await this.resolvePartyAccount(entry);

    if (!partyAccount) {
      throw ApiException.invalidTransaction(
        'Party is not linked to an account and the control account is not configured',
      );
    }

    // Post-dated cheques stay in holding accounts until they mature:
    //  - Cheque RECEIVED -> debit PDC account, credit party.
    //  - Cheque ISSUED   -> debit supplier, credit "Cheques Issued".
    const isPdc = entry.method === 'CHEQUE' && !!entry.chequeDate;
    let postAccount: string;
    if (isPdc && entry.pdcAccountId) {
      postAccount = entry.pdcAccountId;
    } else if (isPdc && entry.paymentType === 'RECEIPT') {
      const chequeInHand = await this.defaultAccounts.resolveAccount(
        'accounting.cheque_in_hand_account',
        'Cheque in Hand',
      );
      if (!chequeInHand) {
        throw ApiException.invalidTransaction(
          'The "Cheque in Hand" account is not configured. Add it to the chart of accounts or set accounting.cheque_in_hand_account.',
        );
      }
      postAccount = chequeInHand;
    } else {
      postAccount = entry.mainAccountId ?? '';
    }
    if (!postAccount) {
      throw ApiException.invalidTransaction(
        'Select the account for this payment entry (e.g. the bank or cash account).',
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
              mainAccountId: postAccount,
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
              mainAccountId: postAccount,
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
          ...(isPdc
            ? { mainAccountId: postAccount, chequeStatus: 'IN_HAND' }
            : entry.method === 'CHEQUE'
              ? { chequeStatus: 'CLEARED' }
              : {}),
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

  async deposit(id: string, actorId?: string) {
    const entry = await this.prisma.paymentEntry.findUnique({ where: { id } });
    if (!entry) throw ApiException.notFound('Payment entry');
    if (entry.method !== 'CHEQUE') {
      throw ApiException.invalidTransaction('Only cheque entries can be cleared');
    }
    if (entry.status !== 'posted') {
      throw ApiException.invalidTransaction('Post the entry before clearing the cheque');
    }
    if (entry.chequeStatus === 'DEPOSITED') return entry;
    if (entry.chequeStatus === 'BOUNCED') {
      throw ApiException.invalidTransaction('A bounced cheque cannot be deposited');
    }
    if (!entry.bankAccountId) {
      throw ApiException.invalidTransaction('Select the bank account for clearing');
    }
    const bank = await this.prisma.bankAccount.findUnique({
      where: { id: entry.bankAccountId },
      include: { mainAccount: true },
    });
    if (!bank?.mainAccountId) {
      throw ApiException.invalidTransaction(
        'The bank account is not linked to a GL account. Link it then clear the cheque.',
      );
    }
    const bankMainAccountId = bank.mainAccountId;
    await this.fiscal.assertOpen(entry.paymentDate, 'Cannot clear a cheque');
    const amount = Number(entry.amount);

    // Post-dated CHEQUES ISSUED: when the payee presents the cheque and our
    // bank debits our account, move the obligation into the bank —
    //   Dr "Cheques Issued" / Cr Bank.
    if (entry.paymentType === 'PAYMENT') {
      const holdingAccount =
        entry.mainAccountId ??
        (await this.defaultAccounts.resolveAccount('accounting.cheque_issued_account', 'Cheques Issued'));
      if (!holdingAccount) {
        throw ApiException.invalidTransaction(
          'The "Cheques Issued" holding account is not configured.',
        );
      }
      const issuedResult = await this.prisma.runInTransaction(async (tx) => {
        const voucher = await this.accounting.createVoucher(
          tx,
          {
            voucherType: 'DEBIT' as any,
            voucherDate: new Date(),
            description: `Cheque presented & cleared ${entry.number} - ${entry.partyName}`,
            reference: entry.number,
            entries: [
              {
                mainAccountId: holdingAccount,
                debit: amount,
                narration: `Cheques Issued - ${entry.number}`,
              },
              {
                mainAccountId: bankMainAccountId,
                credit: amount,
                narration: `Bank ${bank.name} - ${entry.number}`,
              },
            ],
            createdById: actorId,
          },
          await this.numbering.next('voucher_payment', 'PY', tx),
        );
        await this.accounting.postVoucher(tx, voucher.id, actorId);

        return tx.paymentEntry.update({
          where: { id },
          data: {
            chequeStatus: 'CLEARED',
            depositedById: actorId,
            depositedAt: new Date(),
          },
          include: { allocations: true },
        });
      });

      this.audit.record({
        userId: actorId,
        action: 'DEPOSIT',
        module: 'PAYMENT',
        entity: 'PaymentEntry',
        entityId: id,
        message: `Issued cheque ${entry.number} cleared via ${bank.name}`,
      });
      return issuedResult;
    }

    const pdcAccount = entry.pdcAccountId ?? (await this.defaultAccounts.resolveAccount(
      'accounting.cheque_in_hand_account',
      'Cheque in Hand',
    ));
    if (!pdcAccount) {
      throw ApiException.invalidTransaction(
        'The "Cheque in Hand" account is not configured.',
      );
    }

    const result = await this.prisma.runInTransaction(async (tx) => {
      const voucher = await this.accounting.createVoucher(
        tx,
        {
          voucherType: 'DEBIT' as any,
          voucherDate: new Date(),
          description: `Cheque cleared ${entry.number} - ${entry.partyName}`,
          reference: entry.number,
          entries: [
            {
              mainAccountId: bankMainAccountId,
              debit: amount,
              narration: `Bank ${bank.name} - ${entry.number}`,
            },
            {
              mainAccountId: pdcAccount,
              credit: amount,
              narration: `Cheque cleared - ${entry.number}`,
            },
          ],
          createdById: actorId,
        },
        await this.numbering.next('voucher_receipt', 'RV', tx),
      );
      await this.accounting.postVoucher(tx, voucher.id, actorId);

      return tx.paymentEntry.update({
        where: { id },
        data: {
          chequeStatus: 'DEPOSITED',
          depositedById: actorId,
          depositedAt: new Date(),
        },
        include: { allocations: true },
      });
    });

    this.audit.record({
      userId: actorId,
      action: 'DEPOSIT',
      module: 'PAYMENT',
      entity: 'PaymentEntry',
      entityId: id,
      message: `Cheque ${entry.number} cleared into ${bank.name}`,
    });
    return result;
  }

  async bounce(id: string, reason: string, actorId?: string) {
    const entry = await this.prisma.paymentEntry.findUnique({
      where: { id },
      include: { allocations: true },
    });
    if (!entry) throw ApiException.notFound('Payment entry');
    if (entry.method !== 'CHEQUE') {
      throw ApiException.invalidTransaction('Only cheque entries can be bounced');
    }
    if (entry.chequeStatus !== 'IN_HAND') {
      throw ApiException.invalidTransaction(
        'Only cheques currently in hand can be bounced',
      );
    }
    await this.fiscal.assertOpen(entry.paymentDate, 'Cannot bounce a cheque');

    const partyAccount = await this.resolvePartyAccount(entry);
    if (!partyAccount) {
      throw ApiException.invalidTransaction(
        'Party is not linked to an account and the control account is not configured',
      );
    }
    // Post-dated cheques ISSUED that come back (dishonoured / stale):
    //   Dr "Cheques Issued" / Cr Supplier — re-opens the allocated bills.
    const isIssued = entry.paymentType === 'PAYMENT';
    const holdingAccount = isIssued
      ? (entry.mainAccountId ??
        (await this.defaultAccounts.resolveAccount('accounting.cheque_issued_account', 'Cheques Issued')))
      : null;
    if (isIssued && !holdingAccount) {
      throw ApiException.invalidTransaction(
        'The "Cheques Issued" holding account is not configured.',
      );
    }
    const pdcAccount = entry.pdcAccountId ?? (await this.defaultAccounts.resolveAccount(
      'accounting.cheque_in_hand_account',
      'Cheque in Hand',
    ));
    if (!isIssued && !pdcAccount) {
      throw ApiException.invalidTransaction(
        'The "Cheque in Hand" account is not configured.',
      );
    }

    const amount = Number(entry.amount);
    const result = await this.prisma.runInTransaction(async (tx) => {
      const voucher = await this.accounting.createVoucher(
        tx,
        {
          voucherType: 'DEBIT' as any,
          voucherDate: new Date(),
          description: `Cheque bounced ${entry.number} - ${entry.partyName}`,
          reference: entry.number,
          entries: isIssued
            ? [
                {
                  mainAccountId: holdingAccount as string,
                  debit: amount,
                  narration: `Cheques Issued - ${entry.number}`,
                },
                {
                  mainAccountId: partyAccount,
                  credit: amount,
                  narration: `Bounce ${entry.number} - ${entry.partyName}`,
                },
              ]
            : [
                {
                  mainAccountId: partyAccount,
                  debit: amount,
                  narration: `Cheque bounced - ${entry.number}`,
                },
                {
                  mainAccountId: pdcAccount as string,
                  credit: amount,
                  narration: `Bounce ${entry.number} - ${entry.partyName}`,
                },
              ],
          createdById: actorId,
        },
        await this.numbering.next('voucher_receipt', 'RV', tx),
      );
      await this.accounting.postVoucher(tx, voucher.id, actorId);

      for (const a of entry.allocations) {
        const amt = Number(a.allocatedAmount);
        if (a.documentType === 'SALE') {
          const sale = await tx.sale.findUnique({ where: { id: a.documentId } });
          if (sale) {
            const paid = round2(Math.max(0, Number(sale.amountPaid) - amt));
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
            const paid = round2(Math.max(0, Number(purchase.paidAmount) - amt));
            const payStatus =
              paid >= Number(purchase.grandTotal) ? 'paid' : paid > 0 ? 'partial' : 'unpaid';
            await tx.purchase.update({
              where: { id: purchase.id },
              data: { paidAmount: paid, payStatus },
            });
          }
        }
      }

      await tx.paymentAllocation.deleteMany({ where: { paymentEntryId: id } });

      return tx.paymentEntry.update({
        where: { id },
        data: {
          chequeStatus: 'BOUNCED',
          bouncedById: actorId,
          bouncedAt: new Date(),
          bounceReason: reason ?? null,
        },
        include: { allocations: true },
      });
    });

    this.audit.record({
      userId: actorId,
      action: 'BOUNCE',
      module: 'PAYMENT',
      entity: 'PaymentEntry',
      entityId: id,
      message: `Cheque ${entry.number} bounced - ${entry.partyName}`,
      metadata: { reason },
    });
    return result;
  }

  async endorse(
    id: string,
    dto: { partyType: 'CUSTOMER' | 'SUPPLIER'; partyId: string },
    actorId?: string,
  ) {
    const entry = await this.prisma.paymentEntry.findUnique({
      where: { id },
      include: { allocations: true },
    });
    if (!entry) throw ApiException.notFound('Payment entry');
    if (entry.method !== 'CHEQUE') {
      throw ApiException.invalidTransaction('Only cheque entries can be endorsed');
    }
    if (entry.status !== 'posted') {
      throw ApiException.invalidTransaction('Post the entry before endorsing the cheque');
    }
    if (entry.chequeStatus === 'ENDORSED') return entry;
    if (entry.chequeStatus !== 'IN_HAND') {
      throw ApiException.invalidTransaction(
        'Only cheques currently in hand can be endorsed to another party',
      );
    }
    await this.fiscal.assertOpen(entry.paymentDate, 'Cannot endorse a cheque');

    const party =
      dto.partyType === 'CUSTOMER'
        ? await this.prisma.customer.findUnique({ where: { id: dto.partyId } })
        : await this.prisma.supplier.findUnique({ where: { id: dto.partyId } });
    if (!party) throw ApiException.notFound(dto.partyType === 'CUSTOMER' ? 'Customer' : 'Supplier');

    const payeeAccount =
      party.mainAccountId ??
      (await this.defaultAccounts.resolveAccount(
        dto.partyType === 'CUSTOMER' ? 'accounting.receivable_account' : 'accounting.payable_account',
        dto.partyType === 'CUSTOMER' ? 'Accounts Receivable' : 'Accounts Payable',
      ));
    if (!payeeAccount) {
      throw ApiException.invalidTransaction(
        'The payee party is not linked to an account and the control account is not configured',
      );
    }
    const pdcAccount = entry.pdcAccountId ?? (await this.defaultAccounts.resolveAccount(
      'accounting.cheque_in_hand_account',
      'Cheque in Hand',
    ));
    if (!pdcAccount) {
      throw ApiException.invalidTransaction(
        'The "Cheque in Hand" account is not configured.',
      );
    }

    const amount = Number(entry.amount);
    const result = await this.prisma.runInTransaction(async (tx) => {
      const voucher = await this.accounting.createVoucher(
        tx,
        {
          voucherType: 'CREDIT' as any,
          voucherDate: new Date(),
          description: `Cheque endorsed ${entry.number} - from ${entry.partyName} to ${party.name}`,
          reference: entry.number,
          entries: [
            {
              mainAccountId: payeeAccount,
              debit: amount,
              narration: `Cheque endorsed ${entry.number} - ${party.name}`,
            },
            {
              mainAccountId: pdcAccount,
              credit: amount,
              narration: `Endorse ${entry.number} - ${entry.partyName}`,
            },
          ],
          createdById: actorId,
        },
        await this.numbering.next('voucher_payment', 'PY', tx),
      );
      await this.accounting.postVoucher(tx, voucher.id, actorId);

      return tx.paymentEntry.update({
        where: { id },
        data: { chequeStatus: 'ENDORSED' },
        include: { allocations: true },
      });
    });

    this.audit.record({
      userId: actorId,
      action: 'ENDORSE',
      module: 'PAYMENT',
      entity: 'PaymentEntry',
      entityId: id,
      message: `Cheque ${entry.number} endorsed to ${party.name}`,
      metadata: { partyType: dto.partyType, partyId: dto.partyId },
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
    method?: string;
    chequeStatus?: string;
    from?: string;
    to?: string;
  }) {
    const { page = 1, pageSize = 25, search, status, paymentType, partyType, partyId, method, chequeStatus, from, to } = query;
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
    if (method) where.method = method;
    if (chequeStatus) where.chequeStatus = chequeStatus;
    if (from || to) {
      where.paymentDate = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      };
    }

    const [items, total] = await Promise.all([
      this.prisma.paymentEntry.findMany({
        where,
        include: { mainAccount: true, allocations: true, bankAccount: true, pdcAccount: true },
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
      include: { mainAccount: true, allocations: true, bankAccount: true, pdcAccount: true },
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
            dueDate: s.dueDate,
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

  private async resolvePartyAccount(entry: { partyType: string; partyId: string }) {
    return entry.partyType === 'CUSTOMER'
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
  }

  /**
   * Resolves the PDC account to debit when a post-dated cheque is received.
   * Prefers the DTO selection, then the party's linked PDC account, and finally
   * auto-creates a "PDC <party>" account under the PDCS sub-head and links it
   * to the party so subsequent cheques from the same party reuse it.
   */
  private async resolvePdcAccount(dto: CreatePaymentDto, party: { name: string; pdcAccountId?: string | null }) {
    if (dto.pdcAccountId) {
      const existing = await this.prisma.mainAccount.findUnique({
        where: { id: dto.pdcAccountId },
      });
      if (!existing || existing.status !== 'active') {
        throw ApiException.validation('The selected PDC account is not valid');
      }
      return existing;
    }
    if (party.pdcAccountId) {
      const existing = await this.prisma.mainAccount.findUnique({
        where: { id: party.pdcAccountId },
      });
      if (existing && existing.status === 'active') return existing;
    }

    const subHead =
      (await this.prisma.subHead.findFirst({ where: { name: 'PDCS' } })) ??
      (await this.prisma.subHead.findFirst({ where: { name: 'Current Assets' } }));
    const count = await this.prisma.mainAccount.count({
      where: { code: { startsWith: 'PDC-' } },
    });
    const account = await this.prisma.mainAccount.create({
      data: {
        code: `PDC-${String(count + 1).padStart(3, '0')}`,
        name: `PDC ${party.name}`,
        accountType: 'ASSET',
        subHeadId: subHead?.id ?? null,
        status: 'active',
      },
    });
    if (dto.partyType === 'CUSTOMER') {
      await this.prisma.customer.update({
        where: { id: dto.partyId },
        data: { pdcAccountId: account.id },
      });
    } else {
      await this.prisma.supplier.update({
        where: { id: dto.partyId },
        data: { pdcAccountId: account.id },
      });
    }
    return account;
  }

  private async resolveChequeIssuedAccount() {
    const configured = await this.defaultAccounts.resolveAccount(
      'accounting.cheque_issued_account',
      'Cheques Issued',
    );
    if (configured) {
      const account = await this.prisma.mainAccount.findUnique({
        where: { id: configured },
      });
      if (account && account.status === 'active') return account;
    }

    const subHead =
      (await this.prisma.subHead.findFirst({ where: { name: 'Current Liabilities' } })) ?? null;
    const count = await this.prisma.mainAccount.count({
      where: { code: { startsWith: 'CI-' } },
    });
    return this.prisma.mainAccount.create({
      data: {
        code: `CI-${String(count + 1).padStart(3, '0')}`,
        name: 'Cheques Issued',
        accountType: 'LIABILITY',
        subHeadId: subHead?.id ?? null,
        status: 'active',
      },
    });
  }
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
