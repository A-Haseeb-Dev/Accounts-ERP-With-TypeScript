import { describe, it, expect, vi } from 'vitest';
import { InventoryReportsService } from './inventory-reports.service';

function buildService() {
  const prisma = {
    sale: { findMany: vi.fn() },
    purchase: { findMany: vi.fn() },
  };
  const svc = new InventoryReportsService(prisma as never);
  return { svc, prisma };
}

const sale = (over: Record<string, unknown> = {}) => ({
  id: 's1',
  number: 'SO-1',
  saleDate: new Date('2026-09-01T00:00:00Z'),
  status: 'posted',
  customerId: 'c1',
  customer: { name: 'Acme' },
  subtotal: 1000,
  discount: 0,
  tax: 0,
  grandTotal: 1000,
  commission: 100,
  ...over,
});

const purchase = (over: Record<string, unknown> = {}) => ({
  id: 'p1',
  number: 'PO-1',
  purchaseDate: new Date('2026-09-01T00:00:00Z'),
  status: 'posted',
  supplierId: 'v1',
  supplier: { name: 'Vendor' },
  subtotal: 1000,
  discount: 0,
  tax: 0,
  grandTotal: 1000,
  commission: 50,
  ...over,
});

describe('salesCommissionReport', () => {
  it('lists only invoices that carry a commission', async () => {
    const { svc, prisma } = buildService();
    prisma.sale.findMany.mockResolvedValue([sale()]);

    const result = await svc.salesCommissionReport({});

    // The filter lives in the query, so assert on what was sent.
    expect(prisma.sale.findMany.mock.calls[0][0].where).toMatchObject({ commission: { gt: 0 } });
    expect(result.count).toBe(1);
    expect(result.totalCommission).toBe(100);
  });

  it('totals the commission and the invoiced value', async () => {
    const { svc, prisma } = buildService();
    prisma.sale.findMany.mockResolvedValue([
      sale({ id: 's1', number: 'SO-1', customerId: 'c1', customer: { name: 'Acme' }, grandTotal: 1000, commission: 100 }),
      sale({ id: 's2', number: 'SO-2', customerId: 'c2', customer: { name: 'Globex' }, grandTotal: 2000, commission: 300 }),
    ]);

    const result = await svc.salesCommissionReport({});
    expect(result.totalCommission).toBe(400);
    expect(result.grandTotal).toBe(3000);
  });

  it('expresses the commission as a percentage of the invoice', async () => {
    const { svc, prisma } = buildService();
    prisma.sale.findMany.mockResolvedValue([sale({ grandTotal: 1000, commission: 100 })]);
    const result = await svc.salesCommissionReport({});
    expect(result.rows[0].commissionPercent).toBe(10);
  });

  it('does not divide by zero on a zero-value invoice', async () => {
    const { svc, prisma } = buildService();
    prisma.sale.findMany.mockResolvedValue([sale({ grandTotal: 0, commission: 25 })]);
    const result = await svc.salesCommissionReport({});
    expect(result.rows[0].commissionPercent).toBe(0);
  });

  it('groups by customer with invoice count, base and commission', async () => {
    const { svc, prisma } = buildService();
    prisma.sale.findMany.mockResolvedValue([
      sale({ id: 's1', customerId: 'c1', customer: { name: 'Acme' }, grandTotal: 1000, commission: 100 }),
      sale({ id: 's2', customerId: 'c1', customer: { name: 'Acme' }, grandTotal: 1500, commission: 150 }),
      sale({ id: 's3', customerId: 'c2', customer: { name: 'Globex' }, grandTotal: 500, commission: 25 }),
    ]);

    const result = await svc.salesCommissionReport({});
    const acme = result.summary.find((s) => s.partyId === 'c1')!;
    expect(acme.invoices).toBe(2);
    expect(acme.base).toBe(2500);
    expect(acme.commission).toBe(250);
    expect(result.summary).toHaveLength(2);
  });

  it('sorts the per-customer summary by commission, highest first', async () => {
    const { svc, prisma } = buildService();
    prisma.sale.findMany.mockResolvedValue([
      sale({ id: 's1', customerId: 'c1', customer: { name: 'Acme' }, commission: 10 }),
      sale({ id: 's2', customerId: 'c2', customer: { name: 'Globex' }, commission: 90 }),
    ]);
    const result = await svc.salesCommissionReport({});
    expect(result.summary[0].partyId).toBe('c2');
  });

  it('omits the status filter when "All" is chosen', async () => {
    const { svc, prisma } = buildService();
    prisma.sale.findMany.mockResolvedValue([]);
    await svc.salesCommissionReport({ status: 'all' });
    expect(prisma.sale.findMany.mock.calls[0][0].where).not.toHaveProperty('status');
  });

  it('defaults to posted only', async () => {
    const { svc, prisma } = buildService();
    prisma.sale.findMany.mockResolvedValue([]);
    await svc.salesCommissionReport({});
    expect(prisma.sale.findMany.mock.calls[0][0].where.status).toBe('posted');
  });

  it('applies the customer and date filters', async () => {
    const { svc, prisma } = buildService();
    prisma.sale.findMany.mockResolvedValue([]);
    await svc.salesCommissionReport({ customerId: 'c9', from: '2026-09-01', to: '2026-09-30' });
    const where = prisma.sale.findMany.mock.calls[0][0].where;
    expect(where.customerId).toBe('c9');
    expect(where.saleDate).toBeDefined();
  });
});

describe('purchaseCommissionReport', () => {
  it('lists only purchases that carry a commission', async () => {
    const { svc, prisma } = buildService();
    prisma.purchase.findMany.mockResolvedValue([purchase()]);

    const result = await svc.purchaseCommissionReport({});
    expect(prisma.purchase.findMany.mock.calls[0][0].where).toMatchObject({ commission: { gt: 0 } });
    expect(result.count).toBe(1);
    expect(result.totalCommission).toBe(50);
  });

  it('groups by supplier with invoice count, base and commission', async () => {
    const { svc, prisma } = buildService();
    prisma.purchase.findMany.mockResolvedValue([
      purchase({ id: 'p1', supplierId: 'v1', supplier: { name: 'Vendor' }, grandTotal: 1000, commission: 50 }),
      purchase({ id: 'p2', supplierId: 'v1', supplier: { name: 'Vendor' }, grandTotal: 2000, commission: 100 }),
    ]);

    const result = await svc.purchaseCommissionReport({});
    const vendor = result.summary.find((s) => s.partyId === 'v1')!;
    expect(vendor.invoices).toBe(2);
    expect(vendor.base).toBe(3000);
    expect(vendor.commission).toBe(150);
  });

  it('computes the commission percentage of the purchase', async () => {
    const { svc, prisma } = buildService();
    prisma.purchase.findMany.mockResolvedValue([purchase({ grandTotal: 2000, commission: 100 })]);
    const result = await svc.purchaseCommissionReport({});
    expect(result.rows[0].commissionPercent).toBe(5);
  });

  it('omits the status filter when "All" is chosen', async () => {
    const { svc, prisma } = buildService();
    prisma.purchase.findMany.mockResolvedValue([]);
    await svc.purchaseCommissionReport({ status: 'all' });
    expect(prisma.purchase.findMany.mock.calls[0][0].where).not.toHaveProperty('status');
  });

  it('applies the supplier and date filters', async () => {
    const { svc, prisma } = buildService();
    prisma.purchase.findMany.mockResolvedValue([]);
    await svc.purchaseCommissionReport({ supplierId: 'v9', from: '2026-09-01', to: '2026-09-30' });
    const where = prisma.purchase.findMany.mock.calls[0][0].where;
    expect(where.supplierId).toBe('v9');
    expect(where.purchaseDate).toBeDefined();
  });

  it('returns empty totals when nothing matched', async () => {
    const { svc, prisma } = buildService();
    prisma.purchase.findMany.mockResolvedValue([]);
    const result = await svc.purchaseCommissionReport({});
    expect(result.count).toBe(0);
    expect(result.totalCommission).toBe(0);
    expect(result.summary).toEqual([]);
  });
});
