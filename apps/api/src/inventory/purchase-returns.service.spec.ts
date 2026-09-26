import { describe, it, expect, vi } from 'vitest';
import { PurchaseReturnsService } from './purchase-returns.service';
import type { VoucherEntryInput } from '../common/services/accounting.service';

const INVENTORY = 'acct-inventory';
const PAYABLE = 'acct-payable';
const TAX = 'acct-tax';

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
  svc: PurchaseReturnsService;
  createVoucher: ReturnType<typeof vi.fn>;
  header: Record<string, unknown>;
}

function buildService(overrides?: { taxAccountId?: string | null }): Built {
  const taxAccountId = overrides?.taxAccountId === undefined ? TAX : overrides.taxAccountId;

  const defaultAccounts = {
    resolveAccount: vi.fn(async (key: string) => {
      if (key === 'accounting.tax_account') return taxAccountId;
      if (key === 'accounting.inventory_account') return INVENTORY;
      if (key === 'accounting.payable_account') return PAYABLE;
      return null;
    }),
  };

  // Mutable so each test can set the header totals the service reads on post.
  // Line cost (2 x 500 = 1000) is the "gross returned cost" the service uses.
  const header: Record<string, unknown> = {
    id: 'pr-1',
    number: 'PR-0001',
    status: 'draft',
    returnDate: new Date('2026-09-01T00:00:00Z'),
    subtotal: 1000,
    discount: 0,
    tax: 0,
    grandTotal: 1000,
    stockLocationId: 'loc-1',
    supplier: { id: 's-1', name: 'Supplier', mainAccountId: PAYABLE },
    items: [{ id: 'li-1', itemId: 'i-1', quantity: 2, unitCost: 500, discount: 0, tax: 0, lineTotal: 1000 }],
  };

  const prisma = {
    purchaseReturn: {
      findUnique: vi.fn(async () => ({ ...header })),
      update: vi.fn().mockResolvedValue({}),
    },
    systemSetting: { findFirst: vi.fn().mockResolvedValue(null) },
    item: { findUnique: vi.fn().mockResolvedValue({ name: 'Item' }) },
    runInTransaction: vi.fn(async (fn: (tx: unknown) => unknown) =>
      fn({
        purchaseReturn: { update: vi.fn().mockResolvedValue({}) },
        purchaseReturnItem: { create: vi.fn().mockResolvedValue({}) },
      }),
    ),
  };

  const accounting = {
    createVoucher: vi.fn().mockResolvedValue({ id: 'v-1' }),
    postVoucher: vi.fn().mockResolvedValue(undefined),
  };

  const svc = new PurchaseReturnsService(
    prisma as never,
    { record: vi.fn().mockResolvedValue(undefined) } as never,
    { next: vi.fn().mockResolvedValue('PR-0001') } as never,
    { recordOut: vi.fn().mockResolvedValue(undefined), getBalance: vi.fn().mockResolvedValue(99) } as never,
    accounting as never,
    defaultAccounts as never,
    { assertOpen: vi.fn().mockResolvedValue(undefined) } as never,
  );

  return { svc, createVoucher: accounting.createVoucher, header };
}

function entriesOf(createVoucher: ReturnType<typeof vi.fn>): VoucherEntryInput[] {
  return createVoucher.mock.calls[0][1].entries as VoucherEntryInput[];
}

function sum(entries: VoucherEntryInput[], field: 'debit' | 'credit'): number {
  return Math.round(entries.reduce((s, e) => s + Number((e as unknown as Record<string, unknown>)[field] ?? 0), 0) * 100) / 100;
}

describe('PurchaseReturnsService.post voucher netting', () => {
  it('debits the supplier for the grand total and credits inventory for the returned cost', async () => {
    const { svc, createVoucher, header } = buildService();
    Object.assign(header, { subtotal: 1000, discount: 0, tax: 0, grandTotal: 1000 });
    await svc.post('pr-1');

    const entries = entriesOf(createVoucher);
    expect(Number(entries.find((e) => e.mainAccountId === PAYABLE)!.debit)).toBe(1000);
    expect(Number(entries.find((e) => e.mainAccountId === INVENTORY)!.credit)).toBe(1000);
    expect(sum(entries, 'debit')).toBe(sum(entries, 'credit'));
  });

  it('credits tax payable for tax, mirroring the purchase side', async () => {
    const { svc, createVoucher, header } = buildService();
    Object.assign(header, { subtotal: 1000, discount: 0, tax: 100, grandTotal: 1100 });
    await svc.post('pr-1');

    const entries = entriesOf(createVoucher);
    const tax = entries.find((e) => e.mainAccountId === TAX)!;
    // The regression: the sign test was inverted, so tax was debited and the
    // discount branch booked to tax payable instead of inventory.
    expect(Number(tax.credit)).toBe(100);
    expect(Number(entries.find((e) => e.mainAccountId === INVENTORY)!.credit)).toBe(1000);
    expect(sum(entries, 'debit')).toBe(sum(entries, 'credit'));
  });

  it('folds a net discount into the inventory credit rather than the tax account', async () => {
    const { svc, createVoucher, header } = buildService();
    Object.assign(header, { subtotal: 1000, discount: 100, tax: 0, grandTotal: 900 });
    await svc.post('pr-1');

    const entries = entriesOf(createVoucher);
    expect(entries.find((e) => e.mainAccountId === TAX)).toBeUndefined();
    expect(Number(entries.find((e) => e.mainAccountId === INVENTORY)!.credit)).toBe(900);
    expect(Number(entries.find((e) => e.mainAccountId === PAYABLE)!.debit)).toBe(900);
    expect(sum(entries, 'debit')).toBe(sum(entries, 'credit'));
  });

  it('nets a purchase and its full return to zero across all three accounts', async () => {
    for (const totals of [
      { subtotal: 1000, discount: 0, tax: 100, grandTotal: 1100 },
      { subtotal: 1000, discount: 100, tax: 0, grandTotal: 900 },
    ]) {
      const { svc, createVoucher, header } = buildService();
      Object.assign(header, totals);
      await svc.post('pr-1');
      const entries = entriesOf(createVoucher);

      // Original purchase: Dr Inventory 1000, Cr Payable grandTotal, Dr Tax.
      const tax = totals.grandTotal - 1000;
      const purchase: VoucherEntryInput[] = [
        { mainAccountId: INVENTORY, debit: 1000 + Math.min(tax, 0), narration: 'purchase' },
        { mainAccountId: PAYABLE, credit: totals.grandTotal, narration: 'purchase' },
        ...(tax > 0 ? [{ mainAccountId: TAX, debit: tax, narration: 'purchase' }] : []),
      ];

      const net: Record<string, number> = {};
      for (const e of [...purchase, ...entries]) {
        const d = Number((e as unknown as Record<string, unknown>).debit ?? 0);
        const c = Number((e as unknown as Record<string, unknown>).credit ?? 0);
        net[e.mainAccountId] = Math.round(((net[e.mainAccountId] ?? 0) + d - c) * 100) / 100;
      }

      for (const [account, balance] of Object.entries(net)) {
        expect(balance, `account ${account} should net to zero for ${totals.grandTotal}`).toBe(0);
      }
    }
  });

  it('refuses to post when the inventory account is missing', async () => {
    const prisma = {
      purchaseReturn: {
        findUnique: vi.fn(async () => ({
          id: 'pr-1',
          number: 'PR-0001',
          status: 'draft',
          returnDate: new Date('2026-09-01T00:00:00Z'),
          stockLocationId: 'loc-1',
          supplier: { id: 's-1', name: 'Supplier', mainAccountId: PAYABLE },
          items: [],
        })),
      },
    };
    const svc = new PurchaseReturnsService(
      prisma as never,
      { record: vi.fn() } as never,
      { next: vi.fn() } as never,
      { recordOut: vi.fn() } as never,
      { createVoucher: vi.fn(), postVoucher: vi.fn() } as never,
      { resolveAccount: vi.fn(async (k: string) => (k === 'accounting.inventory_account' ? null : PAYABLE)) } as never,
      { assertOpen: vi.fn() } as never,
    );
    await expect(svc.post('pr-1')).rejects.toThrow();
    expect(await apiErrorMessage(svc.post('pr-1'))).toMatch(/Accounting accounts are not configured/);
  });
});
