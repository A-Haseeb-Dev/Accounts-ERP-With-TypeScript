import { describe, it, expect, vi } from 'vitest';
import { SalesService } from './sales.service';
import type { VoucherEntryInput } from '../common/services/accounting.service';

const REVENUE = 'acct-revenue';
const RECEIVABLE = 'acct-receivable';
const TAX = 'acct-tax';
const INVENTORY = 'acct-inventory';
const COST_OF_SALES = 'acct-cogs';

/**
 * The sale must relieve stock at average cost and post that cost to the profit
 * and loss. Unit prices are deliberately set far above the average cost so a
 * posting that used the selling price would be caught.
 */
function buildService(overrides?: {
  averageCost?: number;
  cogsConfigured?: boolean;
  taxAccountId?: string | null;
}) {
  const averageCost = overrides?.averageCost === undefined ? 40 : overrides.averageCost;
  const cogsConfigured = overrides?.cogsConfigured !== false;
  const taxAccountId = overrides?.taxAccountId === undefined ? TAX : overrides.taxAccountId;

  const header: Record<string, unknown> = {
    id: 'sale-1',
    number: 'SO-0001',
    status: 'draft',
    saleDate: new Date('2026-09-01T00:00:00Z'),
    subtotal: 1000,
    discount: 0,
    tax: 0,
    commission: 0,
    grandTotal: 1000,
    amountPaid: 0,
    stockLocationId: 'loc-1',
    customer: { id: 'c-1', name: 'Acme', mainAccountId: RECEIVABLE },
    items: [{ id: 'li-1', itemId: 'i-1', quantity: 10, unitPrice: 100, discount: 0, tax: 0, lineTotal: 1000 }],
  };

  const defaultAccounts = {
    resolveAccount: vi.fn(async (key: string) => {
      if (key === 'accounting.revenue_account') return REVENUE;
      if (key === 'accounting.receivable_account') return RECEIVABLE;
      if (key === 'accounting.tax_account') return taxAccountId;
      if (key === 'accounting.inventory_account') return cogsConfigured ? INVENTORY : null;
      if (key === 'accounting.cost_of_sales_account') return cogsConfigured ? COST_OF_SALES : null;
      if (key === 'accounting.cash_account') return 'acct-cash';
      return null;
    }),
  };

  const prisma = {
    sale: {
      findUnique: vi.fn(async () => ({ ...header })),
      update: vi.fn().mockResolvedValue({}),
    },
    systemSetting: { findFirst: vi.fn().mockResolvedValue(null) },
    runInTransaction: vi.fn(async (fn: (tx: unknown) => unknown) =>
      fn({
        item: { findMany: vi.fn(async () => [{ id: 'i-1', averageCost }]) },
        sale: { update: vi.fn().mockResolvedValue({}) },
      }),
    ),
  };

  const accounting = {
    createVoucher: vi.fn().mockResolvedValue({ id: 'v-1' }),
    postVoucher: vi.fn().mockResolvedValue(undefined),
  };
  const recordOut = vi.fn().mockResolvedValue(0);

  const svc = new SalesService(
    prisma as never,
    { record: vi.fn().mockResolvedValue(undefined) } as never,
    { next: vi.fn().mockResolvedValue('SV-0001') } as never,
    { recordOut, getBalance: vi.fn().mockResolvedValue(99) } as never,
    accounting as never,
    defaultAccounts as never,
    { assertOpen: vi.fn().mockResolvedValue(undefined) } as never,
  );

  return { svc, createVoucher: accounting.createVoucher, recordOut, header };
}

function entriesOf(createVoucher: ReturnType<typeof vi.fn>): VoucherEntryInput[] {
  return createVoucher.mock.calls[0][1].entries as VoucherEntryInput[];
}

function sum(entries: VoucherEntryInput[], field: 'debit' | 'credit'): number {
  return Math.round(
    entries.reduce((s, e) => s + Number((e as unknown as Record<string, unknown>)[field] ?? 0), 0) * 100,
  ) / 100;
}

describe('SalesService.post cost of sales', () => {
  it('relieves stock at the average cost, never the selling price', async () => {
    const { svc, recordOut } = buildService({ averageCost: 40 });
    await svc.post('sale-1');
    expect(recordOut).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ unitCost: 40, quantity: 10 }),
      expect.anything(),
    );
  });

  it('debits cost of sales and credits inventory for the goods sold', async () => {
    const { svc, createVoucher } = buildService({ averageCost: 40 });
    await svc.post('sale-1');

    const entries = entriesOf(createVoucher);
    // 10 units at an average cost of 40 = 400, not the 1000 invoiced.
    expect(Number(entries.find((e) => e.mainAccountId === COST_OF_SALES)!.debit)).toBe(400);
    expect(Number(entries.find((e) => e.mainAccountId === INVENTORY)!.credit)).toBe(400);
  });

  it('balances revenue, tax and cost of sales together', async () => {
    const { svc, createVoucher, header } = buildService({ averageCost: 40 });
    Object.assign(header, { subtotal: 1000, discount: 0, tax: 100, grandTotal: 1100 });
    await svc.post('sale-1');

    const entries = entriesOf(createVoucher);
    // debits: receivable 1100 + cost of sales 400 = 1500
    // credits: revenue 1000 + tax 100 + inventory 400 = 1500
    expect(sum(entries, 'debit')).toBe(1500);
    expect(sum(entries, 'credit')).toBe(1500);
  });

  it('scales the cost of sales with the quantity sold', async () => {
    const { svc, createVoucher, header } = buildService({ averageCost: 25 });
    (header.items as any[])[0].quantity = 4;
    (header.items as any[])[0].lineTotal = 400;
    Object.assign(header, { subtotal: 400, grandTotal: 400 });
    await svc.post('sale-1');

    const entries = entriesOf(createVoucher);
    expect(Number(entries.find((e) => e.mainAccountId === COST_OF_SALES)!.debit)).toBe(100);
  });

  it('refuses to post when the cost of sales account is missing', async () => {
    const { svc } = buildService({ cogsConfigured: false });
    await expect(svc.post('sale-1')).rejects.toThrow();
  });
});
