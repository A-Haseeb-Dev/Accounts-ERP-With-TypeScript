import { describe, it, expect, vi } from 'vitest';
import { SalesService } from './sales.service';

/**
 * A posting blocked by an account setting should say which one.
 *
 * The first version of this guard reported the customer's account link
 * whichever role was actually missing, so an invoice blocked by an unset
 * Revenue account sent the reader to the customer record - and the second
 * guard then found the stock accounts only after that one was fixed. Both
 * made a settings problem look like a data problem.
 */
function buildService(opts: {
  revenue?: string | null;
  receivable?: string | null;
  inventory?: string | null;
  costOfSales?: string | null;
  customerAccountId?: string | null;
}) {
  const {
    revenue = 'acct-revenue',
    receivable = 'acct-receivable',
    inventory = 'acct-inventory',
    costOfSales = 'acct-cogs',
    customerAccountId = 'acct-customer',
  } = opts;

  const roles: Record<string, string | null> = {
    'accounting.revenue_account': revenue,
    'accounting.receivable_account': receivable,
    'accounting.inventory_account': inventory,
    'accounting.cost_of_sales_account': costOfSales,
    'accounting.tax_account': null,
    'accounting.cash_account': null,
  };

  const header = {
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
    customer: { id: 'c-1', name: 'Acme', mainAccountId: customerAccountId },
    items: [
      { id: 'li-1', itemId: 'i-1', quantity: 10, unitPrice: 100, discount: 0, tax: 0, lineTotal: 1000 },
    ],
  };

  const prisma = {
    sale: { findUnique: vi.fn(async () => ({ ...header })), update: vi.fn().mockResolvedValue({}) },
    systemSetting: { findFirst: vi.fn().mockResolvedValue(null) },
    runInTransaction: vi.fn(async (fn: (tx: unknown) => unknown) =>
      fn({
        item: { findMany: vi.fn(async () => [{ id: 'i-1', averageCost: 40 }]) },
        sale: { update: vi.fn().mockResolvedValue({}) },
      }),
    ),
  };

  const accounting = {
    createVoucher: vi.fn().mockResolvedValue({ id: 'v-1' }),
    postVoucher: vi.fn().mockResolvedValue(undefined),
  };

  const svc = new SalesService(
    prisma as never,
    { record: vi.fn().mockResolvedValue(undefined) } as never,
    { next: vi.fn().mockResolvedValue('SV-0001') } as never,
    { recordOut: vi.fn().mockResolvedValue(0), getBalance: vi.fn().mockResolvedValue(99) } as never,
    accounting as never,
    { resolveAccount: vi.fn(async (key: string) => roles[key] ?? null) } as never,
    { assertOpen: vi.fn().mockResolvedValue(undefined) } as never,
  );

  return { svc, createVoucher: accounting.createVoucher };
}

/** `ApiException` keeps its message in the response body, not on the Error. */
async function postError(svc: SalesService): Promise<string> {
  try {
    await svc.post('sale-1');
  } catch (err) {
    const e = err as { getResponse?: () => unknown };
    const resp = (e.getResponse?.() ?? {}) as { error?: { message?: string } };
    return resp.error?.message ?? '';
  }
  throw new Error('expected posting to be refused');
}

describe('SalesService.post missing accounts', () => {
  it('blames Revenue when only Revenue is unset, not the customer', async () => {
    // The customer is linked throughout: the old message claimed otherwise and
    // pointed at the customer record for a settings fault.
    const { svc, createVoucher } = buildService({ revenue: null });

    const message = await postError(svc);

    expect(message).toMatch(/Revenue/);
    expect(message).not.toMatch(/not linked to an account/i);
    expect(message).toMatch(/Settings > Accounting/);
    expect(createVoucher).not.toHaveBeenCalled();
  });

  it('names every missing role in one message', async () => {
    const { svc } = buildService({
      revenue: null,
      receivable: null,
      inventory: null,
      costOfSales: null,
      customerAccountId: null,
    });

    const message = await postError(svc);

    expect(message).toMatch(/Revenue/);
    expect(message).toMatch(/Accounts Receivable/);
    expect(message).toMatch(/Inventory \/ Stock/);
    expect(message).toMatch(/Cost of Sales/);
  });

  it('falls back to the receivable setting when the customer has no account', async () => {
    const { svc, createVoucher } = buildService({ customerAccountId: null });

    // Nothing is missing, so this posts - and the receivable side is the
    // setting's account, which is the whole point of the fallback.
    await svc.post('sale-1');

    const entries = createVoucher.mock.calls[0][1].entries as { mainAccountId?: string }[];
    expect(entries.some((e) => e.mainAccountId === 'acct-receivable')).toBe(true);
  });

  it('suggests linking the customer when the receivable setting is also unset', async () => {
    const { svc } = buildService({ receivable: null, customerAccountId: null });

    const message = await postError(svc);

    expect(message).toMatch(/link an account to this customer/);
  });

  it('posts when every role resolves', async () => {
    const { svc, createVoucher } = buildService({});

    await svc.post('sale-1');

    expect(createVoucher).toHaveBeenCalledTimes(1);
  });
});