import { describe, it, expect, vi } from 'vitest';
import { DashboardService } from './dashboard.service';

/**
 * The dashboard's period figures are "so far this month", not "this month and
 * everything dated after it".
 *
 * The bounds were open-ended, so a purchase or invoice entered with a future
 * date - common when a bill is keyed in ahead of the day it lands - reported
 * itself as money already spent, and a month could show expenses before it had
 * even started. The cheque figures in the same file were already bounded.
 */
type Call = { model: string; where: Record<string, unknown> };

function buildService() {
  const calls: Call[] = [];

  const record = (model: string) => ({
    aggregate: vi.fn(async (args: { where: Record<string, unknown> }) => {
      calls.push({ model, where: args.where ?? {} });
      return { _sum: { grandTotal: null, amount: null, quantityIn: null, quantityOut: null } };
    }),
    count: vi.fn().mockResolvedValue(0),
    findMany: vi.fn().mockResolvedValue([]),
    findFirst: vi.fn().mockResolvedValue(null),
    findUnique: vi.fn().mockResolvedValue(null),
    groupBy: vi.fn().mockResolvedValue([]),
  });

  // Every model the overview touches, so a new query surfaces as a missing mock
  // rather than as a passing test that never ran the code.
  const prisma = {
    bankAccount: record('bankAccount'),
    sale: record('sale'),
    purchase: record('purchase'),
    paymentEntry: record('paymentEntry'),
    inventoryTransaction: record('inventoryTransaction'),
    item: record('item'),
    customer: record('customer'),
    supplier: record('supplier'),
    voucher: record('voucher'),
    voucherEntry: record('voucherEntry'),
    salesReturn: record('salesReturn'),
    purchaseReturn: record('purchaseReturn'),
    systemSetting: { findFirst: vi.fn().mockResolvedValue(null) },
  };

  const inventory = {
    getBalance: vi.fn().mockResolvedValue(0),
    totalStockValue: vi.fn().mockResolvedValue(0),
  };
  const defaultAccounts = { resolveAccount: vi.fn().mockResolvedValue(null) };

  const svc = new DashboardService(prisma as never, inventory as never, defaultAccounts as never);
  return { svc, calls };
}

/** The date filter the dashboard put on a given model and field. */
function bound(calls: Call[], field: string): Record<string, Date> {
  const hit = calls.find((c) => c.where[field] !== undefined);
  if (!hit) throw new Error(`no aggregate filtered on ${field}`);
  return hit.where[field] as Record<string, Date>;
}

describe('DashboardService period bounds', () => {
  it('bounds this month expenses to the month so far', async () => {
    const { svc, calls } = buildService();
    await svc.overview();

    const purchaseDate = bound(calls, 'purchaseDate');
    expect(purchaseDate.gte).toBeInstanceOf(Date);
    // The upper bound is the part that was missing.
    expect(purchaseDate.lt).toBeInstanceOf(Date);
    expect(purchaseDate.lt!.getTime()).toBeGreaterThan(purchaseDate.gte!.getTime());
  });

  it('bounds this month income the same way', async () => {
    const { svc, calls } = buildService();
    await svc.overview();

    const saleDate = bound(calls, 'saleDate');
    expect(saleDate.lt).toBeInstanceOf(Date);
    expect(saleDate.lt!.getTime()).toBeGreaterThan(saleDate.gte!.getTime());
  });

  it('bounds month receipts and payments', async () => {
    const { svc, calls } = buildService();
    await svc.overview();

    const paymentDates = calls
      .filter((c) => c.where.paymentDate !== undefined)
      .map((c) => c.where.paymentDate as Record<string, Date>);
    expect(paymentDates.length).toBeGreaterThan(0);
    for (const d of paymentDates) {
      expect(d.lt).toBeInstanceOf(Date);
    }
  });

  it('never filters a period figure on a future document', async () => {
    const { svc, calls } = buildService();
    await svc.overview();

    const now = Date.now();
    for (const c of calls) {
      for (const [field, value] of Object.entries(c.where)) {
        if (!value || typeof value !== 'object' || !('gte' in value)) continue;
        const range = value as Record<string, Date>;
        if (!range.lt && !range.lte) throw new Error(`${c.model}.${field} has no upper bound`);
        const upper = (range.lt ?? range.lte) as Date;
        expect(upper.getTime()).toBeGreaterThanOrEqual(now);
      }
    }
  });
});