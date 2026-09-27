import { describe, it, expect, vi } from 'vitest';
import { SalesReturnsService } from './sales-returns.service';
import type { VoucherEntryInput } from '../common/services/accounting.service';

const TAX = 'acct-tax';
const REVENUE = 'acct-revenue';
const RECEIVABLE = 'acct-receivable';
const INVENTORY = 'acct-inventory';
const COST_OF_SALES = 'acct-cogs';

async function apiErrorMessage(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (err) {
    const e = err as { getResponse?: () => unknown };
    const resp = (e.getResponse?.() ?? {}) as { error?: { message?: string } };
    return resp.error?.message ?? String((err as Error).message);
  }
  throw new Error('Expected an ApiException but none was thrown');
}

interface Built {
  svc: SalesReturnsService;
  createVoucher: ReturnType<typeof vi.fn>;
  defaultAccounts: { resolveAccount: ReturnType<typeof vi.fn> };
  header: Record<string, unknown>;
}

function buildService(overrides?: {
  taxAccountId?: string | null;
  revenueAccountId?: string | null;
  receivableAccountId?: string | null;
}): Built {
  const taxAccountId = overrides?.taxAccountId === undefined ? TAX : overrides.taxAccountId;
  const revenueAccountId =
    overrides?.revenueAccountId === undefined ? REVENUE : overrides.revenueAccountId;
  const receivableAccountId =
    overrides?.receivableAccountId === undefined ? RECEIVABLE : overrides.receivableAccountId;

  const defaultAccounts = {
    resolveAccount: vi.fn(async (key: string) => {
      if (key === 'accounting.tax_account') return taxAccountId;
      if (key === 'accounting.revenue_account') return revenueAccountId;
      if (key === 'accounting.receivable_account') return receivableAccountId;
      if (key === 'accounting.inventory_account') return INVENTORY;
      if (key === 'accounting.cost_of_sales_account') return COST_OF_SALES;
      return null;
    }),
  };

  // Mutable so each test can set the header totals the service reads on post.
  const header: Record<string, unknown> = {
    id: 'sr-1',
    number: 'SR-0001',
    status: 'draft',
    returnDate: new Date('2026-09-01T00:00:00Z'),
    subtotal: 1000,
    discount: 0,
    tax: 0,
    grandTotal: 1000,
    stockLocationId: 'loc-1',
    customer: { id: 'c-1', name: 'Acme', mainAccountId: RECEIVABLE },
    items: [{ id: 'li-1', itemId: 'i-1', quantity: 2, unitPrice: 500, discount: 0, tax: 0, lineTotal: 1000 }],
  };

  const prisma = {
    salesReturn: {
      findUnique: vi.fn(async () => ({ ...header })),
      update: vi.fn().mockResolvedValue({}),
    },
    runInTransaction: vi.fn(async (fn: (tx: unknown) => unknown) =>
      fn({
        // Goods come back in at their weighted-average cost, which is what the
        // cost of sales reversal is valued at.
        item: { findMany: vi.fn(async () => [{ id: 'i-1', averageCost: 40 }]) },
        salesReturn: { update: vi.fn().mockResolvedValue({}) },
        saleReturnItem: { create: vi.fn().mockResolvedValue({}) },
      }),
    ),
  };

  const accounting = {
    createVoucher: vi.fn().mockResolvedValue({ id: 'v-1' }),
    postVoucher: vi.fn().mockResolvedValue(undefined),
  };

  const svc = new SalesReturnsService(
    prisma as never,
    { record: vi.fn().mockResolvedValue(undefined) } as never,
    { next: vi.fn().mockResolvedValue('RS-0001') } as never,
    { recordIn: vi.fn().mockResolvedValue(undefined) } as never,
    accounting as never,
    defaultAccounts as never,
    { assertOpen: vi.fn().mockResolvedValue(undefined) } as never,
  );

  return { svc, createVoucher: accounting.createVoucher, defaultAccounts, header };
}

function entriesOf(createVoucher: ReturnType<typeof vi.fn>): VoucherEntryInput[] {
  return createVoucher.mock.calls[0][1].entries as VoucherEntryInput[];
}

function sum(entries: VoucherEntryInput[], field: 'debit' | 'credit'): number {
  return Math.round(entries.reduce((s, e) => s + Number((e as unknown as Record<string, unknown>)[field] ?? 0), 0) * 100) / 100;
}

describe('SalesReturnsService.post voucher netting', () => {
  it('debits sales revenue for the net amount and credits the customer for the grand total', async () => {
    const { svc, createVoucher, header } = buildService();
    Object.assign(header, { subtotal: 1000, discount: 100, tax: 0, grandTotal: 900 });
    await svc.post('sr-1');

    const entries = entriesOf(createVoucher);
    const revenue = entries.find((e) => e.mainAccountId === REVENUE)!;
    const customer = entries.find((e) => e.mainAccountId === RECEIVABLE)!;
    // subtotal - discount, matching the revenue credit on the original invoice.
    expect(Number(revenue.debit)).toBe(900);
    expect(Number(customer.credit)).toBe(900);
    expect(sum(entries, 'debit')).toBe(sum(entries, 'credit'));
  });

  it('debits the same revenue account the invoice credited, with no separate returns account', async () => {
    const { svc, createVoucher, defaultAccounts, header } = buildService();
    Object.assign(header, { subtotal: 1000, discount: 0, tax: 0, grandTotal: 1000 });
    await svc.post('sr-1');

    // The return must unwind the sale on its own account. Resolving a dedicated
    // returns account here would leave revenue and returns as separate
    // balances that a reader has to net by hand.
    const keys = defaultAccounts.resolveAccount.mock.calls.map((c) => c[0]);
    expect(keys).not.toContain('accounting.sales_return_account');
    const entries = entriesOf(createVoucher);
    expect(entries.filter((e) => e.mainAccountId === REVENUE)).toHaveLength(1);
  });

  it('debits sales tax payable so the tax on the original invoice is reversed', async () => {
    const { svc, createVoucher, header } = buildService();
    Object.assign(header, { subtotal: 1000, discount: 0, tax: 100, grandTotal: 1100 });
    await svc.post('sr-1');

    const entries = entriesOf(createVoucher);
    const revenue = entries.find((e) => e.mainAccountId === REVENUE)!;
    const tax = entries.find((e) => e.mainAccountId === TAX)!;
    const customer = entries.find((e) => e.mainAccountId === RECEIVABLE)!;

    // The regression: the return used to absorb the tax (debit 1100), which
    // overstated the reversal and left the tax liability credited but never reversed.
    expect(Number(revenue.debit)).toBe(1000);
    expect(Number(tax.debit)).toBe(100);
    expect(Number(customer.credit)).toBe(1100);
    expect(sum(entries, 'debit')).toBe(sum(entries, 'credit'));
  });

  it('nets a sale and its full return to zero on every account', async () => {
    const { svc, createVoucher, header } = buildService();
    Object.assign(header, { subtotal: 1000, discount: 0, tax: 100, grandTotal: 1100 });
    await svc.post('sr-1');
    const entries = entriesOf(createVoucher);

    // Original invoice: Dr Receivable 1100, Cr Revenue 1000, Cr Tax 100.
    const invoice: VoucherEntryInput[] = [
      { mainAccountId: RECEIVABLE, debit: 1100, narration: 'sale' },
      { mainAccountId: REVENUE, credit: 1000, narration: 'sale' },
      { mainAccountId: TAX, credit: 100, narration: 'tax' },
    ];

    const net: Record<string, number> = {};
    for (const e of [...invoice, ...entries]) {
      const d = Number((e as unknown as Record<string, unknown>).debit ?? 0);
      const c = Number((e as unknown as Record<string, unknown>).credit ?? 0);
      net[e.mainAccountId] = Math.round(((net[e.mainAccountId] ?? 0) + d - c) * 100) / 100;
    }

    // Because the return debits the very account the invoice credited, every
    // account cancels on its own - no netting across two revenue accounts.
    expect(net[RECEIVABLE]).toBe(0);
    expect(net[TAX]).toBe(0);
    expect(net[REVENUE]).toBe(0);
  });

  it('folds the tax into the revenue reversal when no tax account is configured', async () => {
    const { svc, createVoucher, header } = buildService({ taxAccountId: null });
    Object.assign(header, { subtotal: 1000, discount: 0, tax: 100, grandTotal: 1100 });
    await svc.post('sr-1');

    const entries = entriesOf(createVoucher);
    const revenue = entries.find((e) => e.mainAccountId === REVENUE)!;
    expect(Number(revenue.debit)).toBe(1100);
    expect(entries.find((e) => e.mainAccountId === TAX)).toBeUndefined();
    expect(sum(entries, 'debit')).toBe(sum(entries, 'credit'));
  });

  it('refuses to post when the revenue account is missing', async () => {
    const { svc } = buildService({ revenueAccountId: null });
    expect(await apiErrorMessage(svc.post('sr-1'))).toMatch(/Accounting accounts are not configured/);
  });
});
