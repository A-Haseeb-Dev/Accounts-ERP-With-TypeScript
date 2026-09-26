import { describe, it, expect, vi } from 'vitest';
import { SalesReturnsService } from './sales-returns.service';
import type { VoucherEntryInput } from '../common/services/accounting.service';

const TAX = 'acct-tax';
const RECEIVABLE = 'acct-receivable';
const SALES_RETURNS = 'acct-sales-returns';
const INVENTORY = 'acct-inventory';
const COST_OF_SALES = 'acct-cogs';

const AVERAGE_COST = 40;

function buildService(overrides?: { taxAccountId?: string | null; cogsConfigured?: boolean }) {
  const taxAccountId = overrides?.taxAccountId === undefined ? TAX : overrides.taxAccountId;
  const cogsConfigured = overrides?.cogsConfigured !== false;

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
    items: [{ id: 'li-1', itemId: 'i-1', quantity: 10, unitPrice: 100, discount: 0, tax: 0, lineTotal: 1000 }],
  };

  const defaultAccounts = {
    resolveAccount: vi.fn(async (key: string) => {
      if (key === 'accounting.tax_account') return taxAccountId;
      if (key === 'accounting.sales_return_account') return SALES_RETURNS;
      if (key === 'accounting.receivable_account') return RECEIVABLE;
      if (key === 'accounting.inventory_account') return cogsConfigured ? INVENTORY : null;
      if (key === 'accounting.cost_of_sales_account') return cogsConfigured ? COST_OF_SALES : null;
      return null;
    }),
  };

  const prisma = {
    salesReturn: {
      findUnique: vi.fn(async () => ({ ...header })),
      update: vi.fn().mockResolvedValue({}),
    },
    runInTransaction: vi.fn(async (fn: (tx: unknown) => unknown) =>
      fn({
        item: {
          findMany: vi.fn(async () => [{ id: 'i-1', averageCost: AVERAGE_COST }]),
        },
        salesReturn: { update: vi.fn().mockResolvedValue({}) },
      }),
    ),
  };

  const accounting = {
    createVoucher: vi.fn().mockResolvedValue({ id: 'v-1' }),
    postVoucher: vi.fn().mockResolvedValue(undefined),
  };

  const recordIn = vi.fn().mockResolvedValue(undefined);

  const svc = new SalesReturnsService(
    prisma as never,
    { record: vi.fn().mockResolvedValue(undefined) } as never,
    { next: vi.fn().mockResolvedValue('RS-0001') } as never,
    { recordIn } as never,
    accounting as never,
    defaultAccounts as never,
    { assertOpen: vi.fn().mockResolvedValue(undefined) } as never,
  );

  return { svc, createVoucher: accounting.createVoucher, header, recordIn };
}

function entriesOf(createVoucher: ReturnType<typeof vi.fn>): VoucherEntryInput[] {
  return createVoucher.mock.calls[0][1].entries as VoucherEntryInput[];
}

function sum(entries: VoucherEntryInput[], field: 'debit' | 'credit'): number {
  return Math.round(entries.reduce((s, e) => s + Number((e as unknown as Record<string, unknown>)[field] ?? 0), 0) * 100) / 100;
}

function netOf(entries: VoucherEntryInput[]): Record<string, number> {
  const net: Record<string, number> = {};
  for (const e of entries) {
    const rec = e as unknown as Record<string, unknown>;
    net[e.mainAccountId] = Math.round(((net[e.mainAccountId] ?? 0) + Number(rec.debit ?? 0) - Number(rec.credit ?? 0)) * 100) / 100;
  }
  return net;
}

describe('SalesReturnsService cost of sales reversal', () => {
  it('restocks at the average cost rather than the price the customer paid', async () => {
    const { svc, recordIn } = buildService();
    await svc.post('sr-1');

    // 10 units at an average cost of 40, not the 100 the customer paid.
    expect(recordIn).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ unitCost: AVERAGE_COST, quantity: 10 }),
    );
  });

  it('debits inventory and credits cost of sales for the returned cost', async () => {
    const { svc, createVoucher } = buildService();
    await svc.post('sr-1');

    const entries = entriesOf(createVoucher);
    expect(Number(entries.find((e) => e.mainAccountId === INVENTORY)!.debit)).toBe(400);
    expect(Number(entries.find((e) => e.mainAccountId === COST_OF_SALES)!.credit)).toBe(400);
    expect(sum(entries, 'debit')).toBe(sum(entries, 'credit'));
  });

  it('balances with tax and cost of sales together', async () => {
    const { svc, createVoucher, header } = buildService();
    Object.assign(header, { subtotal: 1000, discount: 0, tax: 100, grandTotal: 1100 });
    await svc.post('sr-1');

    const entries = entriesOf(createVoucher);
    // debits: sales returns 1000 + tax 100 + inventory 400 = 1500
    // credits: customer 1100 + cost of sales 400 = 1500
    expect(sum(entries, 'debit')).toBe(1500);
    expect(sum(entries, 'credit')).toBe(1500);
  });

  it('reverses exactly what the sale charged, so the pair leaves no residue', async () => {
    const { svc, createVoucher, header } = buildService();
    Object.assign(header, { subtotal: 1000, discount: 0, tax: 100, grandTotal: 1100 });
    await svc.post('sr-1');
    const entries = entriesOf(createVoucher);

    // The original invoice, now including the cost of sales it previously
    // omitted: Dr Receivable 1100, Cr Revenue 1000, Cr Tax 100, Dr COGS 400,
    // Cr Inventory 400.
    const sale: VoucherEntryInput[] = [
      { mainAccountId: RECEIVABLE, debit: 1100, narration: 'sale' },
      { mainAccountId: 'acct-revenue', credit: 1000, narration: 'sale' },
      { mainAccountId: TAX, credit: 100, narration: 'sale' },
      { mainAccountId: COST_OF_SALES, debit: 400, narration: 'sale' },
      { mainAccountId: INVENTORY, credit: 400, narration: 'sale' },
    ];

    const net = netOf([...sale, ...entries]);
    expect(net[RECEIVABLE]).toBe(0);
    expect(net[TAX]).toBe(0);
    expect(net[COST_OF_SALES]).toBe(0);
    expect(net[INVENTORY]).toBe(0);
  });

  it('refuses to post when the cost of sales account is not configured', async () => {
    const { svc } = buildService({ cogsConfigured: false });
    await expect(svc.post('sr-1')).rejects.toThrow();
  });
});
