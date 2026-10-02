import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ApiException } from '../common/exceptions/api.exception';
import { endOfDay, startOfDay } from '../common/utils/date-filter';

/**
 * Reports about a single party and about how old the money owed is.
 *
 * Every party's ledger follows one rule, so customer and supplier stay
 * symmetrical and the sign of a balance always means the same thing:
 *
 *   debit  increases what we owe the party / what the party owes us
 *   credit decreases it
 *
 * An invoice or bill is a debit, a return is a credit, and both a payment and
 * a receipt are credits - paying someone always reduces the balance.
 */
@Injectable()
export class PartyReportsService {
  constructor(private readonly prisma: PrismaService) {}

  private resolveDate(date?: string): string {
    return date?.trim() || new Date().toISOString().slice(0, 10);
  }

  /**
   * Outstanding balance per party, split into ageing buckets.
   *
   * Balance comes from the documents themselves (gross minus what has already
   * been paid, minus returns), not from payment allocations, which can drift
   * out of step with the document.
   */
  async partyAgeing(query: { partyType?: string; asOf?: string; search?: string }) {
    const partyType = query.partyType === 'SUPPLIER' ? 'SUPPLIER' : 'CUSTOMER';
    const asOf = this.resolveDate(query.asOf);
    const to = endOfDay(asOf);
    const search = query.search?.trim();

    const parties =
      partyType === 'SUPPLIER'
        ? await this.prisma.supplier.findMany({
            where: { status: 'active', ...(search ? { name: { contains: search, mode: 'insensitive' as const } } : {}) },
            select: { id: true, code: true, name: true, phone: true },
            orderBy: { name: 'asc' },
          })
        : await this.prisma.customer.findMany({
            where: { status: 'active', ...(search ? { name: { contains: search, mode: 'insensitive' as const } } : {}) },
            select: { id: true, code: true, name: true, phone: true, creditDays: true },
            orderBy: { name: 'asc' },
          });

    const rows: any[] = [];

    for (const party of parties) {
      const docs =
        partyType === 'SUPPLIER'
          ? await this.supplierOpenDocuments(party.id, to)
          : await this.customerOpenDocuments(party.id, to, creditDaysOf(party));
      if (docs.length === 0) continue;

      // Credit notes are applied against the oldest document, not netted inside
      // a bucket: netting would quietly move money between age bands and hide
      // which invoice was actually settled.
      let credit = docs.reduce((s, d) => s + d.credit, 0);
      const buckets = { current: 0, d30: 0, d60: 0, d90: 0, d90plus: 0 };
      let oldest = 0;

      for (const d of [...docs].sort((a, b) => b.ageDays - a.ageDays)) {
        let amount = d.debit;
        if (credit > 0) {
          const used = Math.min(credit, amount);
          credit -= used;
          amount -= used;
        }
        if (amount <= 0.009) continue;
        if (d.ageDays <= 0) buckets.current += amount;
        else if (d.ageDays <= 30) buckets.d30 += amount;
        else if (d.ageDays <= 60) buckets.d60 += amount;
        else if (d.ageDays <= 90) buckets.d90 += amount;
        else buckets.d90plus += amount;
        if (d.ageDays > oldest) oldest = d.ageDays;
      }

      const rounded = roundBuckets(buckets);
      const total = round2(rounded.current + rounded.d30 + rounded.d60 + rounded.d90 + rounded.d90plus);
      if (total === 0) continue;

      rows.push({
        partyId: party.id,
        code: party.code,
        name: party.name,
        phone: party.phone ?? null,
        creditDays: 'creditDays' in party ? party.creditDays : null,
        ...rounded,
        total,
        oldestDays: oldest,
        overdue: round2(rounded.d30 + rounded.d60 + rounded.d90 + rounded.d90plus),
      });
    }

    rows.sort((a, b) => b.total - a.total);

    const acc = { current: 0, d30: 0, d60: 0, d90: 0, d90plus: 0, total: 0, overdue: 0 };
    for (const r of rows) {
      acc.current += r.current;
      acc.d30 += r.d30;
      acc.d60 += r.d60;
      acc.d90 += r.d90;
      acc.d90plus += r.d90plus;
      acc.total += r.total;
      acc.overdue += r.overdue;
    }

    return {
      asOf,
      partyType,
      rows,
      totals: { ...roundBuckets(acc), total: round2(acc.total), overdue: round2(acc.overdue) },
    };
  }

  /** Customer invoices/returns still open at `to`, with age in days. */
  private async customerOpenDocuments(customerId: string, to: Date, creditDays: number) {
    const [sales, returns] = await Promise.all([
      this.prisma.sale.findMany({
        where: { customerId, status: 'posted', paymentStatus: { not: 'paid' }, saleDate: { lte: to } },
        select: { grandTotal: true, amountPaid: true, dueDate: true, saleDate: true },
      }),
      this.prisma.salesReturn.findMany({
        where: { customerId, status: 'posted', returnDate: { lte: to } },
        select: { grandTotal: true, returnDate: true },
      }),
    ]);

    return [
      ...sales.map((s) => ({
        debit: round2(num(s.grandTotal) - num(s.amountPaid)),
        credit: 0,
        // Age from the due date, not the sale date, so an invoice paid late still
        // shows as overdue for the whole time it was late.
        ageDays: ageOf(s.dueDate ?? addDays(s.saleDate, creditDays), to),
      })),
      ...returns.map((r) => ({ debit: 0, credit: round2(num(r.grandTotal)), ageDays: 0 })),
    ];
  }

  /**
   * Supplier bills/returns still open at `to`, with age in days.
   *
   * Suppliers carry no credit period and purchases store no due date, so a bill
   * ages from its own date. Adding a supplier due-date column later would be a
   * schema change, not a change to how this report reads a bill.
   */
  private async supplierOpenDocuments(supplierId: string, to: Date) {
    const [purchases, returns] = await Promise.all([
      this.prisma.purchase.findMany({
        where: { supplierId, status: 'posted', payStatus: { not: 'paid' }, purchaseDate: { lte: to } },
        select: { grandTotal: true, paidAmount: true, purchaseDate: true },
      }),
      this.prisma.purchaseReturn.findMany({
        where: { supplierId, status: 'posted', returnDate: { lte: to } },
        select: { grandTotal: true, returnDate: true },
      }),
    ]);

    return [
      ...purchases.map((p) => ({
        debit: round2(num(p.grandTotal) - num(p.paidAmount)),
        credit: 0,
        ageDays: ageOf(p.purchaseDate, to),
      })),
      ...returns.map((r) => ({ debit: 0, credit: round2(num(r.grandTotal)), ageDays: 0 })),
    ];
  }

  /**
   * One party's statement: every invoice, return and receipt/payment in the
   * period with a running balance.
   */
  async partyStatement(query: { partyType?: string; partyId?: string; from?: string; to?: string }) {
    const partyType = query.partyType === 'SUPPLIER' ? 'SUPPLIER' : 'CUSTOMER';
    const partyId = query.partyId;
    if (!partyId) throw ApiException.validation('partyId is required');

    const isSupplier = partyType === 'SUPPLIER';
    const asOf = this.resolveDate(query.to);
    const to = endOfDay(asOf);
    const from = query.from ? startOfDay(query.from) : undefined;

    const party = isSupplier
      ? await this.prisma.supplier.findUnique({
          where: { id: partyId },
          select: { id: true, code: true, name: true, openingBalance: true },
        })
      : await this.prisma.customer.findUnique({
          where: { id: partyId },
          select: { id: true, code: true, name: true, openingBalance: true, creditDays: true },
        });
    if (!party) throw ApiException.notFound(isSupplier ? 'Supplier' : 'Customer');

    const [docs, payments, opening] = await Promise.all([
      isSupplier ? this.supplierLedgerDocs(partyId, from, to) : this.customerLedgerDocs(partyId, from, to),
      this.prisma.paymentEntry.findMany({
        where: { partyId, partyType, status: 'posted', paymentDate: from ? { gte: from, lte: to } : { lte: to } },
        select: { number: true, paymentDate: true, paymentType: true, amount: true, reference: true, narration: true },
      }),
      this.partyOpening(partyId, partyType, party.openingBalance, from),
    ]);

    const lines: any[] = [
      ...docs,
      // Both directions reduce the balance, so both are credits.
      ...payments.map((p) => ({
        kind: p.paymentType === 'RECEIPT' ? 'receipt' : 'payment',
        date: p.paymentDate,
        number: p.number,
        reference: p.reference ?? null,
        narration: p.narration ?? null,
        dueDate: null,
        debit: 0,
        credit: round2(num(p.amount)),
      })),
    ];
    lines.sort(
      (a, b) =>
        new Date(a.date).getTime() - new Date(b.date).getTime() ||
        String(a.number).localeCompare(String(b.number), undefined, { numeric: true }),
    );

    let running = opening;
    const rows = lines.map((l) => {
      running = round2(running + l.debit - l.credit);
      return { ...l, balance: running };
    });

    const totalDebit = round2(rows.reduce((s, r) => s + r.debit, 0));
    const totalCredit = round2(rows.reduce((s, r) => s + r.credit, 0));

    return {
      partyType,
      party: {
        id: party.id,
        code: party.code,
        name: party.name,
        creditDays: 'creditDays' in party ? party.creditDays : null,
      },
      from: query.from ?? null,
      to: asOf,
      opening,
      rows,
      totalDebit,
      totalCredit,
      closing: running,
      balanceType: running > 0 ? 'DR' : running < 0 ? 'CR' : null,
    };
  }

  /** Stored opening balance plus every document and payment before `from`. */
  private async partyOpening(
    partyId: string,
    partyType: 'CUSTOMER' | 'SUPPLIER',
    stored: unknown,
    from: Date | undefined,
  ): Promise<number> {
    let opening = round2(num(stored));
    if (!from) return opening;

    const before = new Date(from.getTime() - 1);
    const [docs, pays] = await Promise.all([
      partyType === 'SUPPLIER' ? this.supplierLedgerDocs(partyId, undefined, before) : this.customerLedgerDocs(partyId, undefined, before),
      this.prisma.paymentEntry.findMany({
        where: { partyId, partyType, status: 'posted', paymentDate: { lt: from } },
        select: { amount: true },
      }),
    ]);

    opening += docs.reduce((s, d) => s + d.debit - d.credit, 0);
    // Payments are credits on this ledger, so they subtract.
    opening -= pays.reduce((s, p) => s + num(p.amount), 0);
    return round2(opening);
  }

  private async customerLedgerDocs(customerId: string, from: Date | undefined, to: Date) {
    const where = { lte: to, ...(from ? { gte: from } : {}) };
    const [sales, returns] = await Promise.all([
      this.prisma.sale.findMany({
        where: { customerId, status: 'posted', saleDate: where },
        select: { number: true, saleDate: true, grandTotal: true, dueDate: true },
      }),
      this.prisma.salesReturn.findMany({
        where: { customerId, status: 'posted', returnDate: where },
        select: { number: true, returnDate: true, grandTotal: true },
      }),
    ]);
    return [
      ...sales.map((s) => ({
        kind: 'invoice',
        date: s.saleDate,
        number: s.number,
        dueDate: s.dueDate ?? null,
        reference: null,
        narration: null,
        debit: round2(num(s.grandTotal)),
        credit: 0,
      })),
      ...returns.map((r) => ({
        kind: 'credit-note',
        date: r.returnDate,
        number: r.number,
        dueDate: null,
        reference: null,
        narration: null,
        debit: 0,
        credit: round2(num(r.grandTotal)),
      })),
    ];
  }

  private async supplierLedgerDocs(supplierId: string, from: Date | undefined, to: Date) {
    const where = { lte: to, ...(from ? { gte: from } : {}) };
    const [purchases, returns] = await Promise.all([
      this.prisma.purchase.findMany({
        where: { supplierId, status: 'posted', purchaseDate: where },
        select: { number: true, purchaseDate: true, grandTotal: true, note: true },
      }),
      this.prisma.purchaseReturn.findMany({
        where: { supplierId, status: 'posted', returnDate: where },
        select: { number: true, returnDate: true, grandTotal: true },
      }),
    ]);
    return [
      ...purchases.map((p) => ({
        kind: 'bill',
        date: p.purchaseDate,
        number: p.number,
        dueDate: null,
        reference: null,
        narration: p.note ?? null,
        debit: round2(num(p.grandTotal)),
        credit: 0,
      })),
      ...returns.map((r) => ({
        kind: 'debit-note',
        date: r.returnDate,
        number: r.number,
        dueDate: null,
        reference: null,
        narration: null,
        debit: 0,
        credit: round2(num(r.grandTotal)),
      })),
    ];
  }
}

/** Whole days from `date` to `to`. Never negative. */
function ageOf(date: Date | string, to: Date): number {
  const ms = to.getTime() - new Date(date).getTime();
  return ms <= 0 ? 0 : Math.floor(ms / 86400000);
}

function addDays(date: Date, days: number): Date {
  return new Date(new Date(date).getTime() + days * 86400000);
}

/** Only customers carry a credit period; suppliers are billed on their own date. */
function creditDaysOf(party: unknown): number {
  const v = (party as { creditDays?: unknown } | null)?.creditDays;
  return num(v);
}

function num(v: unknown): number {
  return Number(v ?? 0);
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function roundBuckets(b: { current: number; d30: number; d60: number; d90: number; d90plus: number }) {
  return {
    current: round2(b.current),
    d30: round2(b.d30),
    d60: round2(b.d60),
    d90: round2(b.d90),
    d90plus: round2(b.d90plus),
  };
}
