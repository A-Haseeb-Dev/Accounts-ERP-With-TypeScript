import { describe, it, expect, vi } from 'vitest';
import { QuotationsService } from './quotations.service';

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
  svc: QuotationsService;
  prisma: Record<string, any>;
  numbering: { next: ReturnType<typeof vi.fn>; preview: ReturnType<typeof vi.fn> };
  header: Record<string, any>;
  create: ReturnType<typeof vi.fn>;
  updateQuotation: ReturnType<typeof vi.fn>;
  deleteQuotation: ReturnType<typeof vi.fn>;
  createSale: ReturnType<typeof vi.fn>;
  tx: Record<string, any>;
}

function buildService(overrides?: { header?: Record<string, unknown> }): Built {
  const header: Record<string, any> = {
    id: 'q-1',
    number: 'QT-0001',
    status: 'draft',
    customerId: 'c-1',
    quotationDate: new Date('2026-09-01T00:00:00Z'),
    validUntil: new Date('2026-10-01T00:00:00Z'),
    subtotal: 1000,
    discount: 0,
    tax: 0,
    grandTotal: 1000,
    convertedSaleId: null,
    ...overrides?.header,
  };

  const create = vi.fn().mockImplementation(async ({ data }: any) => ({ ...header, ...data }));
  const updateQuotation = vi.fn().mockImplementation(async ({ data }: any) => ({ ...header, ...data }));
  const deleteQuotation = vi.fn().mockResolvedValue({});
  const createSale = vi.fn().mockImplementation(async ({ data }: any) => ({ id: 'sale-1', number: data.number, ...data }));

  const tx: Record<string, any> = {
    quotation: { create, update: updateQuotation, delete: deleteQuotation },
    quotationItem: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    sale: { create: createSale },
  };

  const prisma: Record<string, any> = {
    customer: { findUnique: vi.fn(async () => ({ id: 'c-1', name: 'Acme', creditDays: 30 })) },
    item: { findMany: vi.fn(async () => [{ id: 'i-1' }]) },
    quotation: {
      findUnique: vi.fn(async () => ({ ...header, items: [] })),
      update: updateQuotation,
      delete: deleteQuotation,
    },
    stockLocation: {
      findFirst: vi.fn(async () => ({ id: 'loc-1', code: 'MAIN', status: 'active' })),
    },
    runInTransaction: vi.fn(async (fn: (t: unknown) => unknown) => fn(tx)),
  };

  const numbering = { next: vi.fn().mockResolvedValue('QT-0001'), preview: vi.fn().mockResolvedValue('QT-0001') };

  const svc = new QuotationsService(
    prisma as never,
    { record: vi.fn().mockResolvedValue(undefined) } as never,
    numbering as never,
    { assertOpen: vi.fn().mockResolvedValue(undefined) } as never,
  );

  return { svc, prisma, numbering, header, create, updateQuotation, deleteQuotation, createSale, tx };
}

const validDto = {
  quotationDate: '2026-09-01',
  customerId: 'c-1',
  items: [{ itemId: 'i-1', quantity: 2, unitPrice: 500 }],
};

describe('QuotationsService.create', () => {
  it('creates a draft quotation with the number auto-generated', async () => {
    const { svc, create, numbering } = buildService();
    await svc.create(validDto as never);

    expect(numbering.next).toHaveBeenCalledWith('quotation', 'QT');
    expect(create).toHaveBeenCalledTimes(1);
    const data = create.mock.calls[0][0].data;
    expect(data.number).toBe('QT-0001');
    expect(data.status).toBe('draft');
    expect(data.grandTotal).toBe(1000);
  });

  it('does not touch stock or the ledger, and needs no stock location', async () => {
    const { svc, create, prisma } = buildService();
    await svc.create(validDto as never);

    const data = create.mock.calls[0][0].data;
    // A quotation must never book stock movements or accounting.
    expect(data.stockLocationId).toBeUndefined();
    expect(prisma.inventoryTransaction).toBeUndefined();
  });

  it('defaults valid-until to 30 days after the quotation date', async () => {
    const { svc, create } = buildService();
    await svc.create(validDto as never);
    const validUntil = create.mock.calls[0][0].data.validUntil as Date;
    expect(validUntil.toISOString().slice(0, 10)).toBe('2026-10-01');
  });

  it('rejects a quotation for a customer that does not exist', async () => {
    const { svc, prisma } = buildService();
    prisma.customer.findUnique = vi.fn(async () => null);
    expect(await apiErrorMessage(svc.create(validDto as never))).toMatch(/customer/i);
  });

  it('rejects a header discount that would make the total negative', async () => {
    // The DTO only bounds `discount` at >= 0. Without a ceiling against the
    // pre-discount total, `subtotal - discount + tax` goes negative and saves
    // as a negative document.
    const { svc, create } = buildService();
    const msg = await apiErrorMessage(svc.create({ ...validDto, discount: 1500 } as never));
    expect(msg).toMatch(/discount/i);
    expect(create).not.toHaveBeenCalled();
  });

  it('still allows a discount equal to the pre-discount total', async () => {
    const { svc, create } = buildService();
    await svc.create({ ...validDto, discount: 1000 } as never);
    expect(create.mock.calls[0][0].data.grandTotal).toBe(0);
  });
});

describe('QuotationsService status flow', () => {
  it('moves a draft to sent and stamps sentAt', async () => {
    const { svc, updateQuotation, header } = buildService();
    await svc.send('q-1');
    const data = updateQuotation.mock.calls[0][0].data;
    expect(data.status).toBe('sent');
    expect(data.sentAt).toBeInstanceOf(Date);
    expect(header.status).toBe('draft');
  });

  it('refuses to accept a quotation that was never sent', async () => {
    const { svc } = buildService();
    expect(await apiErrorMessage(svc.accept('q-1'))).toMatch(/not been sent/i);
  });

  it('refuses to send a quotation that was already sent', async () => {
    const { svc } = buildService({ header: { status: 'sent' } });
    expect(await apiErrorMessage(svc.send('q-1'))).toMatch(/only draft/i);
  });

  it('accepts a sent quotation and records the decision time', async () => {
    const { svc, updateQuotation } = buildService({ header: { status: 'sent' } });
    await svc.accept('q-1');
    const data = updateQuotation.mock.calls[0][0].data;
    expect(data.status).toBe('accepted');
    expect(data.decidedAt).toBeInstanceOf(Date);
  });

  it('keeps the rejection reason on the quotation', async () => {
    const { svc, updateQuotation } = buildService({ header: { status: 'sent' } });
    await svc.reject('q-1', 'Price too high');
    expect(updateQuotation.mock.calls[0][0].data.decideReason).toBe('Price too high');
  });

  it('blocks every change once the quotation has been converted', async () => {
    const { svc } = buildService({ header: { status: 'accepted', convertedSaleId: 'sale-1' } });
    expect(await apiErrorMessage(svc.update('q-1', validDto as never))).toMatch(/converted/i);
    expect(await apiErrorMessage(svc.send('q-1'))).toMatch(/converted/i);
    expect(await apiErrorMessage(svc.remove('q-1'))).toMatch(/converted/i);
  });
});

describe('QuotationsService.convertToSale', () => {
  const accepted = {
    header: { status: 'accepted', items: [{ itemId: 'i-1', quantity: 2, unitPrice: 500, discount: 0, tax: 0, lineTotal: 1000 }] },
  };

  it('creates a draft invoice referencing the quotation', async () => {
    const { svc, createSale, updateQuotation } = buildService(accepted);
    const result = await svc.convertToSale('q-1', {});

    const data = createSale.mock.calls[0][0].data;
    expect(data.status).toBe('draft');
    expect(data.reference).toBe('QT-0001');
    expect(data.customerId).toBe('c-1');
    expect(data.stockLocationId).toBe('loc-1');
    expect(data.grandTotal).toBe(1000);
    // The invoice is left in draft, so posting (stock + ledger) stays deliberate.
    expect(result.sale.id).toBe('sale-1');
    expect(updateQuotation).toHaveBeenCalledWith(
      expect.objectContaining({ data: { convertedSaleId: 'sale-1' } }),
    );
  });

  it('refuses to convert a quotation that is not accepted', async () => {
    const { svc, createSale } = buildService({ header: { status: 'sent', items: [] } });
    expect(await apiErrorMessage(svc.convertToSale('q-1', {}))).toMatch(/only accepted/i);
    expect(createSale).not.toHaveBeenCalled();
  });

  it('refuses a second conversion of the same quotation', async () => {
    const { svc, createSale } = buildService({
      header: { status: 'accepted', convertedSaleId: 'sale-1', items: [] },
    });
    expect(await apiErrorMessage(svc.convertToSale('q-1', {}))).toMatch(/already been converted/i);
    expect(createSale).not.toHaveBeenCalled();
  });

  it('uses the requested stock location when one is given', async () => {
    const { svc, createSale } = buildService(accepted);
    await svc.convertToSale('q-1', { stockLocationId: 'loc-9' });
    expect(createSale.mock.calls[0][0].data.stockLocationId).toBe('loc-9');
  });
});

describe('QuotationsService.remove', () => {
  it('deletes an unconverted quotation in any status', async () => {
    const { svc, deleteQuotation } = buildService({ header: { status: 'rejected' } });
    await svc.remove('q-1');
    expect(deleteQuotation).toHaveBeenCalledWith({ where: { id: 'q-1' } });
  });
});
