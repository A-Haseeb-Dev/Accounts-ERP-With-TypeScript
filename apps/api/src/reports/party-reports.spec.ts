import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PartyReportsService } from './party-reports.service';
import { DayReportsService } from './day-reports.service';

/**
 * These reports are pure arithmetic over mocked rows, so the tests concentrate
 * on the two things that silently corrupt a statement: the sign of a balance,
 * and how ageing is measured when the due date sits behind the document date.
 */

function buildParty(prisma: Record<string, unknown> = {}) {
  return new PartyReportsService(prisma as never);
}

const customer = (over: Record<string, unknown> = {}) => ({
  id: 'c1',
  code: 'C-1',
  name: 'Acme',
  phone: null,
  creditDays: 30,
  status: 'active',
  openingBalance: 0,
  ...over,
});

const supplier = (over: Record<string, unknown> = {}) => ({
  id: 'v1',
  code: 'V-1',
  name: 'Vendor',
  phone: null,
  status: 'active',
  openingBalance: 0,
  ...over,
});

const sale = (over: Record<string, unknown> = {}) => ({
  number: 'SO-1',
  saleDate: new Date('2026-09-01T00:00:00Z'),
  dueDate: null,
  grandTotal: 1000,
  amountPaid: 0,
  status: 'posted',
  ...over,
});

const purchase = (over: Record<string, unknown> = {}) => ({
  number: 'PO-1',
  purchaseDate: new Date('2026-09-01T00:00:00Z'),
  grandTotal: 800,
  paidAmount: 0,
  status: 'posted',
  ...over,
});

describe('PartyReportsService.partyAgeing', () => {
  const AS_OF = '2026-10-01';

  it('buckets an invoice by days since its due date, not since it was sold', async () => {
    // Sold 1 Sep, due 30 days later = 1 Oct. Measured on 1 Oct that is 0 days
    // late, so it belongs in "not due" even though it is already a month old.
    const prisma = {
      customer: { findMany: vi.fn().mockResolvedValue([customer()]) },
      sale: {
        findMany: vi.fn().mockResolvedValue([
          sale({ saleDate: new Date('2026-09-01T00:00:00Z'), dueDate: new Date('2026-10-01T00:00:00Z') }),
        ]),
      },
      salesReturn: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const result = await buildParty(prisma).partyAgeing({ asOf: AS_OF });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].current).toBe(1000);
    expect(result.rows[0].overdue).toBe(0);
    expect(result.rows[0].oldestDays).toBe(0);
  });

  it('ages from the sale date plus credit period when no due date was set', async () => {
    const prisma = {
      customer: { findMany: vi.fn().mockResolvedValue([customer({ creditDays: 30 })]) },
      sale: {
        findMany: vi.fn().mockResolvedValue([
          sale({ saleDate: new Date('2026-09-01T00:00:00Z'), dueDate: null }),
        ]),
      },
      salesReturn: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const result = await buildParty(prisma).partyAgeing({ asOf: AS_OF });

    // 1 Sep + 30 days = 1 Oct, so 0 days overdue.
    expect(result.rows[0].current).toBe(1000);
  });

  it('splits balance across buckets by age and totals them', async () => {
    const prisma = {
      customer: { findMany: vi.fn().mockResolvedValue([customer({ creditDays: 0 })]) },
      sale: {
        findMany: vi.fn().mockResolvedValue([
          sale({ number: 'SO-1', saleDate: new Date('2026-09-25T00:00:00Z') }), // 6 days
          sale({ number: 'SO-2', saleDate: new Date('2026-09-15T00:00:00Z') }), // 16 days
          sale({ number: 'SO-3', saleDate: new Date('2026-06-01T00:00:00Z') }), // 122 days
        ]),
      },
      salesReturn: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const result = await buildParty(prisma).partyAgeing({ asOf: AS_OF });
    const row = result.rows[0];

    expect(row.d30).toBe(2000);
    expect(row.d90plus).toBe(1000);
    expect(row.total).toBe(3000);
    expect(result.totals.total).toBe(3000);
  });

  it('nets what has already been paid off the outstanding balance', async () => {
    const prisma = {
      customer: { findMany: vi.fn().mockResolvedValue([customer()]) },
      sale: { findMany: vi.fn().mockResolvedValue([sale({ grandTotal: 1000, amountPaid: 400 })]) },
      salesReturn: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const result = await buildParty(prisma).partyAgeing({ asOf: AS_OF });
    expect(result.rows[0].total).toBe(600);
  });

  it('applies a credit note against the oldest document, not inside its own bucket', async () => {
    const prisma = {
      customer: { findMany: vi.fn().mockResolvedValue([customer({ creditDays: 0 })]) },
      sale: {
        findMany: vi.fn().mockResolvedValue([
          sale({ number: 'SO-OLD', saleDate: new Date('2026-01-01T00:00:00Z'), grandTotal: 1000, amountPaid: 0 }),
          sale({ number: 'SO-NEW', saleDate: new Date('2026-09-30T00:00:00Z'), grandTotal: 500, amountPaid: 0 }),
        ]),
      },
      salesReturn: { findMany: vi.fn().mockResolvedValue([{ grandTotal: 400, returnDate: new Date('2026-09-30T00:00:00Z') }]) },
    };
    const result = await buildParty(prisma).partyAgeing({ asOf: AS_OF });
    const row = result.rows[0];

    // The 400 credit clears 400 of the 273-day-old invoice, leaving 600 there.
    // The newer invoice is a day old, so it lands in the 1-30 bucket rather
    // than "not due".
    expect(row.d90plus).toBe(600);
    expect(row.d30).toBe(500);
    expect(row.current).toBe(0);
    expect(row.total).toBe(1100);
  });

  it('excludes fully paid invoices from ageing', async () => {
    const prisma = {
      customer: { findMany: vi.fn().mockResolvedValue([customer()]) },
      sale: { findMany: vi.fn().mockResolvedValue([]) },
      salesReturn: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const svc = buildParty(prisma);
    const result = await svc.partyAgeing({ asOf: AS_OF });

    expect(prisma.sale.findMany.mock.calls[0][0].where).toMatchObject({ paymentStatus: { not: 'paid' } });
    expect(result.rows).toHaveLength(0);
  });

  it('ages a supplier bill from its own date, since suppliers carry no due date', async () => {
    const prisma = {
      supplier: { findMany: vi.fn().mockResolvedValue([supplier()]) },
      purchase: {
        findMany: vi.fn().mockResolvedValue([purchase({ purchaseDate: new Date('2026-09-15T00:00:00Z') })]),
      },
      purchaseReturn: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const result = await buildParty(prisma).partyAgeing({ partyType: 'SUPPLIER', asOf: AS_OF });

    expect(result.rows[0].d30).toBe(800);
    expect(result.rows[0].creditDays).toBeNull();
  });

  it('sorts the largest balance first', async () => {
    const prisma = {
      customer: {
        findMany: vi.fn().mockResolvedValue([
          customer({ id: 'c1', code: 'C-1', name: 'Small' }),
          customer({ id: 'c2', code: 'C-2', name: 'Big' }),
        ]),
      },
      sale: { findMany: vi.fn() },
      salesReturn: { findMany: vi.fn().mockResolvedValue([]) },
    };
    // One documents query per party, in the order the parties came back.
    prisma.sale.findMany
      .mockResolvedValueOnce([sale({ grandTotal: 100, amountPaid: 0 })])
      .mockResolvedValueOnce([sale({ grandTotal: 900, amountPaid: 0 })]);

    const result = await buildParty(prisma).partyAgeing({ asOf: AS_OF });
    expect(result.rows.map((r: { name: string }) => r.name)).toEqual(['Big', 'Small']);
  });
});

describe('PartyReportsService.partyStatement', () => {
  function statementPrisma(over: Record<string, unknown> = {}) {
    return {
      customer: { findUnique: vi.fn().mockResolvedValue(customer()) },
      supplier: { findUnique: vi.fn().mockResolvedValue(supplier()) },
      sale: { findMany: vi.fn().mockResolvedValue([]) },
      salesReturn: { findMany: vi.fn().mockResolvedValue([]) },
      purchase: { findMany: vi.fn().mockResolvedValue([]) },
      purchaseReturn: { findMany: vi.fn().mockResolvedValue([]) },
      paymentEntry: { findMany: vi.fn().mockResolvedValue([]), aggregate: vi.fn().mockResolvedValue({ _sum: { amount: null } }) },
      ...over,
    };
  }

  it('carries a running balance from the opening figure', async () => {
    const prisma = statementPrisma({
      customer: { findUnique: vi.fn().mockResolvedValue(customer({ openingBalance: 500 })) },
      sale: {
        findMany: vi.fn().mockResolvedValue([
          sale({ number: 'SO-1', saleDate: new Date('2026-09-05T00:00:00Z'), grandTotal: 1000 }),
          sale({ number: 'SO-2', saleDate: new Date('2026-09-06T00:00:00Z'), grandTotal: 250 }),
        ]),
      },
    });
    const result = await buildParty(prisma).partyStatement({ partyId: 'c1', to: '2026-09-30' });

    expect(result.opening).toBe(500);
    expect(result.rows.map((r: { balance: number }) => r.balance)).toEqual([1500, 1750]);
    expect(result.closing).toBe(1750);
    expect(result.balanceType).toBe('DR');
  });

  it('treats a receipt as a credit that reduces what is owed', async () => {
    const prisma = statementPrisma({
      sale: {
        findMany: vi.fn().mockResolvedValue([sale({ number: 'SO-1', saleDate: new Date('2026-09-05T00:00:00Z'), grandTotal: 1000 })]),
      },
      paymentEntry: {
        findMany: vi.fn().mockResolvedValue([
          {
            number: 'RCP-1',
            paymentDate: new Date('2026-09-10T00:00:00Z'),
            paymentType: 'RECEIPT',
            amount: 400,
            reference: null,
            narration: null,
          },
        ]),
        aggregate: vi.fn().mockResolvedValue({ _sum: { amount: null } }),
      },
    });
    const result = await buildParty(prisma).partyStatement({ partyId: 'c1', to: '2026-09-30' });

    const receipt = result.rows.find((r: { kind: string }) => r.kind === 'receipt');
    expect(receipt.credit).toBe(400);
    expect(receipt.debit).toBe(0);
    expect(result.closing).toBe(600);
    expect(result.totalDebit).toBe(1000);
    expect(result.totalCredit).toBe(400);
  });

  it('treats a payment as a credit on a supplier statement too', async () => {
    const prisma = statementPrisma({
      purchase: {
        findMany: vi.fn().mockResolvedValue([purchase({ number: 'PO-1', purchaseDate: new Date('2026-09-05T00:00:00Z'), grandTotal: 800 })]),
      },
      paymentEntry: {
        findMany: vi.fn().mockResolvedValue([
          {
            number: 'PAY-1',
            paymentDate: new Date('2026-09-10T00:00:00Z'),
            paymentType: 'PAYMENT',
            amount: 300,
            reference: null,
            narration: null,
          },
        ]),
        aggregate: vi.fn().mockResolvedValue({ _sum: { amount: null } }),
      },
    });
    const result = await buildParty(prisma).partyStatement({
      partyType: 'SUPPLIER',
      partyId: 'v1',
      to: '2026-09-30',
    });

    expect(result.closing).toBe(500);
    expect(result.balanceType).toBe('DR');
  });

  it('pulls everything before "from" into the opening figure so the period ties up', async () => {
    const allSales = [
      sale({ number: 'SO-1', saleDate: new Date('2026-09-05T00:00:00Z'), grandTotal: 1000 }),
      sale({ number: 'SO-2', saleDate: new Date('2026-09-20T00:00:00Z'), grandTotal: 200 }),
    ];

    // The period query carries both bounds; the opening query has only an
    // upper bound. Answer from that instead of relying on call order.
    const prisma = statementPrisma();
    prisma.sale.findMany.mockImplementation(({ where }: { where: { saleDate?: { gte?: Date } } }) =>
      Promise.resolve(where.saleDate?.gte ? [allSales[1]] : [allSales[0]]),
    );

    const result = await buildParty(prisma).partyStatement({ partyId: 'c1', from: '2026-09-10', to: '2026-09-30' });

    expect(result.opening).toBe(1000);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].number).toBe('SO-2');
    expect(result.closing).toBe(1200);
    // Opening plus this period's debits and credits always equals the closing.
    expect(result.opening + result.totalDebit - result.totalCredit).toBe(result.closing);
  });

  it('rejects a request with no party', async () => {
    await expect(buildParty(statementPrisma()).partyStatement({})).rejects.toMatchObject({
      response: { error: { code: 'VALIDATION_ERROR', message: 'partyId is required' } },
    });
  });

  it('404s a party that does not exist', async () => {
    const prisma = statementPrisma({ customer: { findUnique: vi.fn().mockResolvedValue(null) } });
    await expect(buildParty(prisma).partyStatement({ partyId: 'nope' })).rejects.toMatchObject({
      response: { error: { code: 'NOT_FOUND', message: 'Customer not found' } },
    });
  });
});

describe('DayReportsService.dayReport', () => {
  function dayPrisma(over: Record<string, unknown> = {}) {
    const emptyAgg = { _count: { _all: 0 }, _sum: {} };
    return {
      sale: { aggregate: vi.fn().mockResolvedValue(emptyAgg) },
      salesReturn: { aggregate: vi.fn().mockResolvedValue(emptyAgg) },
      purchase: { aggregate: vi.fn().mockResolvedValue(emptyAgg) },
      purchaseReturn: { aggregate: vi.fn().mockResolvedValue(emptyAgg) },
      paymentEntry: { aggregate: vi.fn().mockResolvedValue(emptyAgg) },
      voucher: { count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]) },
      voucherEntry: { aggregate: vi.fn().mockResolvedValue({ _sum: { debit: null } }), groupBy: vi.fn().mockResolvedValue([]) },
      mainAccount: { findUnique: vi.fn().mockResolvedValue(null) },
      // No prefix overrides and nothing orphaned, so the day book keeps every
      // posted voucher. `findFirst` is the Cash-account lookup.
      systemSetting: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue({ value: null }) },
      $queryRawUnsafe: vi.fn().mockResolvedValue([]),
      ...over,
    };
  }

  beforeEach(() => vi.clearAllMocks());

  it('reports the day it was asked for and defaults to today', async () => {
    const result = await new DayReportsService(dayPrisma() as never).dayReport({ date: '2026-09-10' });
    expect(result.date).toBe('2026-09-10');
    expect(result.summary.date).toBe('2026-09-10');

    const defaulted = await new DayReportsService(dayPrisma() as never).dayReport({});
    expect(defaulted.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('nets sales and purchases against their returns', async () => {
    const prisma = dayPrisma();
    prisma.sale.aggregate.mockResolvedValue({ _count: { _all: 3 }, _sum: { grandTotal: 1000 } });
    prisma.salesReturn.aggregate.mockResolvedValue({ _count: { _all: 1 }, _sum: { grandTotal: 200 } });
    prisma.purchase.aggregate.mockResolvedValue({ _count: { _all: 2 }, _sum: { grandTotal: 700 } });
    prisma.purchaseReturn.aggregate.mockResolvedValue({ _count: { _all: 1 }, _sum: { grandTotal: 100 } });

    const { summary } = await new DayReportsService(prisma as never).dayReport({ date: '2026-09-10' });

    expect(summary.netSales).toBe(800);
    expect(summary.netPurchases).toBe(600);
    expect(summary.sales.count).toBe(3);
    expect(summary.salesReturns.count).toBe(1);
  });

  it('splits receipts from payments and counts expenses as cash out', async () => {
    const prisma = dayPrisma();
    prisma.paymentEntry.aggregate
      .mockResolvedValueOnce({ _count: { _all: 2 }, _sum: { amount: 1500 } }) // RECEIPT
      .mockResolvedValueOnce({ _count: { _all: 1 }, _sum: { amount: 400 } }); // PAYMENT
    prisma.voucherEntry.aggregate.mockResolvedValue({ _sum: { debit: 250 } });

    const { summary } = await new DayReportsService(prisma as never).dayReport({ date: '2026-09-10' });

    const receiptCall = prisma.paymentEntry.aggregate.mock.calls[0][0];
    const paymentCall = prisma.paymentEntry.aggregate.mock.calls[1][0];
    expect(receiptCall.where).toMatchObject({ paymentType: 'RECEIPT', status: 'posted' });
    expect(paymentCall.where).toMatchObject({ paymentType: 'PAYMENT', status: 'posted' });

    expect(summary.cashIn).toBe(1500);
    expect(summary.expenses).toBe(250);
    expect(summary.cashOut).toBe(650);
  });

  it('resolves the cash account from settings rather than scanning the chart', async () => {
    const prisma = dayPrisma({
      systemSetting: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue({ value: 'acc-cash' }) },
      mainAccount: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'acc-cash',
          code: '01-01',
          name: 'Cash in Hand',
          openingBalance: 0,
          openingBalanceType: 'DR',
        }),
      },
    });

    await new DayReportsService(prisma as never).dayReport({ date: '2026-09-10' });

    expect(prisma.systemSetting.findFirst).toHaveBeenCalledWith({
      where: { key: 'accounting.cash_account' },
      select: { value: true },
    });
    expect(prisma.mainAccount.findUnique).toHaveBeenCalledWith({
      where: { id: 'acc-cash' },
      select: expect.anything(),
    });
  });

  it('adds the opening position to the movement to get closing cash', async () => {
    const prisma = dayPrisma({
      systemSetting: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue({ value: 'acc-cash' }) },
      mainAccount: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'acc-cash',
          code: '01-01',
          name: 'Cash in Hand',
          openingBalance: 10000,
          openingBalanceType: 'DR',
        }),
      },
    });
    // Aggregates run in a fixed order: the expense total inside the summary's
    // Promise.all, then the opening-voucher lookup, then groupBy for movement.
    prisma.voucherEntry.aggregate
      .mockResolvedValueOnce({ _sum: { debit: null } }) // expense total
      .mockResolvedValueOnce({ _sum: { debit: null, credit: null } }); // no opening voucher
    prisma.voucherEntry.groupBy.mockResolvedValue([
      { mainAccountId: 'acc-cash', _sum: { debit: 2000, credit: 500 } },
    ]);

    const { summary } = await new DayReportsService(prisma as never).dayReport({ date: '2026-09-10' });

    expect(summary.closingCash).toBe(11500);
    expect(summary.cashAccount).toEqual({ code: '01-01', name: 'Cash in Hand' });
  });

  it('prefers an opening voucher over the stored opening balance, as the cash book does', async () => {
    const prisma = dayPrisma({
      systemSetting: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue({ value: 'acc-cash' }) },
      mainAccount: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'acc-cash',
          code: '01-01',
          name: 'Cash',
          openingBalance: 99999,
          openingBalanceType: 'DR',
        }),
      },
    });
    prisma.voucherEntry.aggregate
      .mockResolvedValueOnce({ _sum: { debit: null } })
      .mockResolvedValueOnce({ _sum: { debit: 5000, credit: 0 } }); // opening voucher wins
    prisma.voucherEntry.groupBy.mockResolvedValue([
      { mainAccountId: 'acc-cash', _sum: { debit: 100, credit: 0 } },
    ]);

    const { summary } = await new DayReportsService(prisma as never).dayReport({ date: '2026-09-10' });
    expect(summary.closingCash).toBe(5100);
  });

  it('honours a credit opening balance sign', async () => {
    const prisma = dayPrisma({
      systemSetting: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue({ value: 'acc-cash' }) },
      mainAccount: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'acc-cash',
          code: '01-01',
          name: 'Cash',
          openingBalance: 500,
          openingBalanceType: 'CR',
        }),
      },
    });
    prisma.voucherEntry.aggregate
      .mockResolvedValueOnce({ _sum: { debit: null } })
      .mockResolvedValueOnce({ _sum: { debit: null, credit: null } });
    prisma.voucherEntry.groupBy.mockResolvedValue([
      { mainAccountId: 'acc-cash', _sum: { debit: 0, credit: 200 } },
    ]);

    const { summary } = await new DayReportsService(prisma as never).dayReport({ date: '2026-09-10' });
    expect(summary.closingCash).toBe(-700);
  });

  it('leaves closing cash at zero and flags it when no cash account is mapped', async () => {
    const prisma = dayPrisma();
    const { summary } = await new DayReportsService(prisma as never).dayReport({ date: '2026-09-10' });
    expect(summary.cashAccount).toBeNull();
    expect(summary.closingCash).toBe(0);
    // Crucially, it must not fall back to scanning asset accounts for a
    // guess - only the mapped account is ever consulted.
    expect(prisma.mainAccount.findUnique).not.toHaveBeenCalled();
    expect(prisma.voucherEntry.groupBy).not.toHaveBeenCalled();
  });

  it('shows only posted vouchers for the chosen day, hand journals included', async () => {
    const prisma = dayPrisma();
    const result = await new DayReportsService(prisma as never).dayReport({ date: '2026-09-10', page: 2, pageSize: 25 });

    const where = prisma.voucher.findMany.mock.calls[0][0].where;
    expect(where.status).toBe('posted');
    expect(where.voucherDate.gte.toISOString()).toBe('2026-09-10T00:00:00.000Z');
    expect(where.voucherDate.lte.toISOString()).toBe('2026-09-10T23:59:59.999Z');
    // A voucher with no document reference is a manual journal and must show.
    expect(where.OR[0]).toEqual({ reference: null });

    expect(prisma.voucher.findMany.mock.calls[0][0].skip).toBe(25);
    expect(prisma.voucher.findMany.mock.calls[0][0].take).toBe(25);
    expect(result.page).toBe(2);
  });

  it('flattens voucher entries with the account name attached', async () => {
    const prisma = dayPrisma({
      voucher: {
        count: vi.fn().mockResolvedValue(1),
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'v1',
            number: 'JV-1',
            voucherType: 'JOURNAL',
            voucherDate: new Date('2026-09-10T09:00:00Z'),
            description: 'Rent',
            reference: null,
            totalDebit: 500,
            totalCredit: 500,
            entries: [
              {
                narration: 'Rent paid',
                debit: 500,
                credit: 0,
                mainAccount: { code: '05-01', name: 'Rent Expense' },
              },
              {
                narration: null,
                debit: 0,
                credit: 500,
                mainAccount: { code: '01-01', name: 'Cash in Hand' },
              },
            ],
          },
        ]),
      },
    });

    const result = await new DayReportsService(prisma as never).dayReport({ date: '2026-09-10' });
    expect(result.total).toBe(1);
    expect(result.vouchers[0].entries).toHaveLength(2);
    expect(result.vouchers[0].entries[0].accountName).toBe('Rent Expense');
  });
});
