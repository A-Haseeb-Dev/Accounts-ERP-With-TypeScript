import { describe, it, expect, vi } from 'vitest';
import { DeliveryOrdersService } from './delivery-orders.service';
import type { VoucherEntryInput } from '../common/services/accounting.service';

const COST_OF_SALES = 'acct-cogs';
const INVENTORY = 'acct-inventory';

/**
 * A delivery order relieves the stock exactly once. The interesting cases are
 * the two ways it can happen - the order goes out before the invoice, or the
 * invoice was already posted - and the case where the order ships more than
 * the invoice line still owes.
 */
function buildService(opts: {
  saleStatus?: string;
  invoicePosted?: boolean;
  orderStatus?: string;
  stockRelieved?: boolean;
  deliveredQuantity?: number;
  averageCost?: number;
}) {
  const invoicePosted = opts.invoicePosted ?? false;
  const averageCost = opts.averageCost ?? 40;
  const deliveredQuantity = opts.deliveredQuantity ?? 0;

  const saleItems = [
    {
      id: 'si-1',
      itemId: 'i-1',
      quantity: 10,
      unitPrice: 100,
      deliveredQuantity,
      relievedQuantity: 0,
    },
  ];

  const order = {
    id: 'do-1',
    number: 'DO-0001',
    status: opts.orderStatus ?? 'draft',
    deliveryDate: new Date('2026-09-01T00:00:00Z'),
    saleId: 'sale-1',
    customerId: 'c-1',
    stockLocationId: 'loc-1',
    subtotal: 500,
    grandTotal: 500,
    stockRelieved: opts.stockRelieved ?? false,
    customer: { id: 'c-1', name: 'Acme' },
    stockLocation: { id: 'loc-1', name: 'Main' },
    items: [
      {
        id: 'doi-1',
        itemId: 'i-1',
        saleItemId: 'si-1',
        quantity: 5,
        unitPrice: 100,
        lineTotal: 500,
        item: { id: 'i-1', name: 'Widget', code: 'W-1' },
      },
    ],
  };

  const sale = {
    id: 'sale-1',
    number: 'SI-0001',
    status: opts.saleStatus ?? (invoicePosted ? 'posted' : 'draft'),
    customerId: 'c-1',
    stockLocationId: 'loc-1',
    items: saleItems,
  };

  const saleItemUpdate = vi.fn().mockResolvedValue({});
  const deliveryOrderUpdate = vi.fn().mockImplementation(async (args: any) => ({
    ...order,
    ...args.data,
  }));
  const deliveryOrderCreate = vi.fn().mockImplementation(async (args: any) => ({
    ...order,
    ...args.data,
  }));

  const tx = {
    item: { findMany: vi.fn(async () => [{ id: 'i-1', averageCost }]) },
    saleItem: { update: saleItemUpdate },
    deliveryOrder: { update: deliveryOrderUpdate, create: deliveryOrderCreate },
    voucher: { findMany: vi.fn().mockResolvedValue([]) },
  };

  const prisma = {
    deliveryOrder: {
      findUnique: vi.fn(async () => order),
      create: deliveryOrderCreate,
      update: deliveryOrderUpdate,
      delete: vi.fn().mockResolvedValue({}),
    },
    sale: { findUnique: vi.fn(async () => sale) },
    customer: { findUnique: vi.fn(async () => ({ id: 'c-1', name: 'Acme' })) },
    stockLocation: { findUnique: vi.fn(async () => ({ id: 'loc-1', name: 'Main' })) },
    item: {
      findMany: vi.fn(async () => [{ id: 'i-1', name: 'Widget', code: 'W-1' }]),
      findUnique: vi.fn(async () => ({ id: 'i-1', name: 'Widget' })),
    },
    mainAccount: { findFirst: vi.fn().mockResolvedValue(null) },
    systemSetting: { findFirst: vi.fn().mockResolvedValue(null) },
    runInTransaction: vi.fn(async (fn: (t: unknown) => unknown) => fn(tx)),
  };

  const createVoucher = vi.fn().mockResolvedValue({ id: 'v-1' });
  const accounting = {
    createVoucher,
    postVoucher: vi.fn().mockResolvedValue(undefined),
    cancelVoucher: vi.fn().mockResolvedValue(undefined),
  };
  const recordOut = vi.fn().mockResolvedValue(0);
  const recordIn = vi.fn().mockResolvedValue(0);

  const defaultAccounts = {
    resolveAccount: vi.fn(async (key: string) => {
      if (key === 'accounting.cost_of_sales_account') return COST_OF_SALES;
      if (key === 'accounting.inventory_account') return INVENTORY;
      return null;
    }),
  };

  const svc = new DeliveryOrdersService(
    prisma as never,
    { record: vi.fn().mockResolvedValue(undefined) } as never,
    { next: vi.fn().mockResolvedValue('DO-0001'), preview: vi.fn().mockReturnValue('DO-0001') } as never,
    { recordOut, recordIn, getBalance: vi.fn().mockResolvedValue(99) } as never,
    accounting as never,
    defaultAccounts as never,
    { assertOpen: vi.fn().mockResolvedValue(undefined) } as never,
  );

  return { svc, createVoucher, recordOut, recordIn, saleItemUpdate, deliveryOrderUpdate, deliveryOrderCreate, order, saleItems };
}

function entriesOf(createVoucher: ReturnType<typeof vi.fn>): VoucherEntryInput[] {
  return createVoucher.mock.calls[0][1].entries as VoucherEntryInput[];
}

/** The message an ApiException carries, for a readable failure. */
function errorMessage(err: unknown): string {
  const e = err as { getResponse?: () => unknown };
  const resp = (e.getResponse?.() ?? {}) as { error?: { message?: string } };
  return resp.error?.message ?? (err as Error)?.message ?? '';
}

describe('DeliveryOrdersService.create', () => {
  it('creates a standalone dispatch when no invoice is linked', async () => {
    const { svc, deliveryOrderCreate } = buildService({});
    await svc.create({
      customerId: 'c-1',
      stockLocationId: 'loc-1',
      items: [{ itemId: 'i-1', quantity: 5, unitPrice: 100 }],
    });

    const args = deliveryOrderCreate.mock.calls[0][0];
    expect(args.data.saleId).toBeNull();
    expect(args.data.items.create[0].saleItemId).toBeNull();
    expect(args.data.items.create[0].quantity).toBe(5);
  });

  it('ships what the invoice still owes when no lines are given', async () => {
    const { svc, deliveryOrderCreate } = buildService({ deliveredQuantity: 4 });
    await svc.create({ saleId: 'sale-1' });

    const args = deliveryOrderCreate.mock.calls[0][0];
    expect(args.data.items.create[0].quantity).toBe(6);
    expect(args.data.items.create[0].saleItemId).toBe('si-1');
  });

  it('refuses to ship more than the invoice line still owes', async () => {
    const { svc } = buildService({ deliveredQuantity: 8 });
    const err = await svc
      .create({
        saleId: 'sale-1',
        items: [{ itemId: 'i-1', quantity: 5, saleItemId: 'si-1' }],
      })
      .catch((e: unknown) => e);
    expect(errorMessage(err)).toMatch(/still owes|More has already been dispatched/);
  });
});

describe('DeliveryOrdersService.post', () => {
  it('relieves the stock and posts the cost of sales when the invoice is not posted yet', async () => {
    const { svc, createVoucher, recordOut, saleItemUpdate, deliveryOrderUpdate } = buildService({});
    await svc.post('do-1');

    expect(recordOut).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ quantity: 5, unitCost: 40 }),
      expect.anything(),
    );

    const entries = entriesOf(createVoucher);
    expect(Number(entries.find((e) => e.mainAccountId === COST_OF_SALES)!.debit)).toBe(200);
    expect(Number(entries.find((e) => e.mainAccountId === INVENTORY)!.credit)).toBe(200);

    expect(saleItemUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'si-1' },
        data: expect.objectContaining({ deliveredQuantity: { increment: 5 } }),
      }),
    );
    expect(deliveryOrderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'posted', stockRelieved: true }),
      }),
    );
  });

  it('does not relieve the stock twice when the invoice was already posted', async () => {
    const { svc, createVoucher, recordOut, saleItemUpdate, deliveryOrderUpdate } = buildService({
      invoicePosted: true,
    });
    await svc.post('do-1');

    expect(recordOut).not.toHaveBeenCalled();
    expect(createVoucher).not.toHaveBeenCalled();

    // The dispatch is still recorded against the invoice line.
    expect(saleItemUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'si-1' },
        data: expect.objectContaining({ deliveredQuantity: { increment: 5 } }),
      }),
    );
    expect(deliveryOrderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'posted', stockRelieved: false }),
      }),
    );
  });

  it('refuses to dispatch more than the invoice line still owes', async () => {
    const { svc } = buildService({ deliveredQuantity: 8 });
    const err = await svc.post('do-1').catch((e: unknown) => e);
    expect(errorMessage(err)).toMatch(/still owes|More has already been dispatched/);
  });
});

describe('DeliveryOrdersService.cancel', () => {
  it('brings the goods back and strikes the dispatch off the invoice', async () => {
    const { svc, recordIn, saleItemUpdate } = buildService({
      orderStatus: 'posted',
      stockRelieved: true,
    });
    await svc.cancel('do-1', 'Customer refused the goods');

    expect(recordIn).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ quantity: 5 }),
    );
    expect(saleItemUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'si-1' },
        data: expect.objectContaining({ deliveredQuantity: { decrement: 5 } }),
      }),
    );
  });
});
