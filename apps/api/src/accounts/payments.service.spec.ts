import { describe, it, expect, vi } from 'vitest';
import { PaymentsService } from './payments.service';
import { EditChequeDto } from './dto/payments.dto';

function apiErrorMessage(p: Promise<unknown>): Promise<string> {
  return p.then(
    () => {
      throw new Error('Expected an ApiException but none was thrown');
    },
    (err) => {
      const e = err as { getResponse?: () => unknown };
      const resp = (e.getResponse?.() ?? {}) as { error?: { message?: string } };
      return resp.error?.message ?? String((err as Error).message);
    },
  );
}

const baseEntry = (overrides: Record<string, unknown> = {}) => ({
  id: 'cheque-1',
  number: 'PN-000001',
  paymentType: 'PAYMENT',
  partyType: 'SUPPLIER',
  partyId: 'supplier-1',
  partyName: 'Test Supplier',
  mainAccountId: 'cash',
  method: 'CHEQUE',
  chequeNumber: '00421579',
  bankAccountId: 'bank-1',
  pdcAccountId: null,
  chequeDate: null,
  chequeStatus: 'PENDING',
  amount: 1000,
  paymentDate: new Date('2026-09-01T10:00:00Z'),
  reference: null,
  narration: null,
  status: 'pending',
  allocations: [],
  ...overrides,
});

function buildService(overrides?: {
  paymentEntry?: { findUnique?: ReturnType<typeof vi.fn>; update?: ReturnType<typeof vi.fn> };
  bankAccount?: { findUnique?: ReturnType<typeof vi.fn> };
  supplier?: { findUnique?: ReturnType<typeof vi.fn> };
  mainAccount?: { findUnique?: ReturnType<typeof vi.fn> };
}) {
  const paymentEntry = {
    findUnique: vi.fn(),
    update: vi.fn(async (args: { data: Record<string, unknown> }) => ({
      ...baseEntry(),
      ...(args.data ?? {}),
      allocations: [],
    })),
    ...(overrides?.paymentEntry ?? {}),
  };
  const bankAccount = { findUnique: vi.fn().mockResolvedValue({ id: 'bank-1', name: 'Bank A' }) };
  const supplier = {
    findUnique: vi.fn().mockResolvedValue({ id: 'supplier-1', name: 'Test Supplier' }),
    ...(overrides?.supplier ?? {}),
  };
  const mainAccount = {
    findUnique: vi.fn().mockResolvedValue({ id: 'cash', code: '001', name: 'Cash', status: 'active' }),
    ...(overrides?.mainAccount ?? {}),
  };
  const prisma = {
    paymentEntry,
    bankAccount: { ...bankAccount, ...(overrides?.bankAccount ?? {}) },
    supplier,
    mainAccount,
    runInTransaction: vi.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
    voucher: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'voucher-1',
        entries: [
          { mainAccountId: 'cash', debit: 1000, credit: 0, narration: 'a' },
          { mainAccountId: 'ap-1', debit: 0, credit: 1000, narration: 'b' },
        ],
      }),
    },
  };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const numbering = { next: vi.fn().mockResolvedValue('RV-000001') };
  const accounting = {
    createVoucher: vi.fn(async (_tx: unknown, input: { entries: unknown[] }) => ({
      id: 'rv-1',
      status: 'draft',
      entries: input.entries,
    })),
    postVoucher: vi.fn(async () => ({ status: 'posted' })),
  };
  const defaultAccounts = { resolveAccount: vi.fn().mockResolvedValue(null) };
  const fiscal = { assertOpen: vi.fn().mockResolvedValue(undefined) };
  const svc = new PaymentsService(
    prisma as never,
    audit as never,
    numbering as never,
    accounting as never,
    defaultAccounts as never,
    fiscal as never,
  );
  return { svc, prisma, audit, fiscal, accounting };
}

describe('PaymentsService.updateCheque', () => {
  it('updates cheque metadata on a pending cheque', async () => {
    const { svc, prisma } = buildService();
    prisma.paymentEntry.findUnique.mockResolvedValue(baseEntry());

    const result = await svc.updateCheque('cheque-1', {
      chequeNumber: '00998877',
      reference: 'Fixed ref',
    } as EditChequeDto, 'actor');

    expect(result.chequeNumber).toBe('00998877');
    expect(result.reference).toBe('Fixed ref');
    expect(prisma.paymentEntry.update).toHaveBeenCalledTimes(1);
    expect(prisma.paymentEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ chequeNumber: '00998877', reference: 'Fixed ref' }),
      }),
    );
  });

  it('allows amount and payment date correction before posting', async () => {
    const { svc, prisma } = buildService();
    prisma.paymentEntry.findUnique.mockResolvedValue(baseEntry());

    const result = await svc.updateCheque('cheque-1', {
      amount: 2500,
      paymentDate: '2026-09-05T10:00:00Z',
    } as EditChequeDto, 'actor');

    expect(result.amount).toBe(2500);
    expect(prisma.paymentEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ amount: 2500 }) }),
    );
  });

  it('corrects amount on a posted in-hand cheque via reversal and re-post', async () => {
    const { svc, prisma, accounting } = buildService();
    prisma.paymentEntry.findUnique.mockResolvedValue(baseEntry({ status: 'posted', chequeStatus: 'IN_HAND', voucherId: 'voucher-1' }));
    prisma.paymentEntry.update.mockImplementationOnce(async (args: { data: Record<string, unknown> }) => ({
      ...baseEntry({ status: 'pending' }),
      ...(args.data ?? {}),
      allocations: [],
    }));

    const result = await svc.updateCheque('cheque-1', {
      amount: 2500,
    } as EditChequeDto, 'actor');

    expect(accounting.createVoucher).toHaveBeenCalled();
    expect(prisma.paymentEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ amount: 2500 }) }),
    );
    expect(result).toBeDefined();
  });

  it('corrects payment date on a posted in-hand cheque via reversal and re-post', async () => {
    const { svc, prisma, accounting } = buildService();
    prisma.paymentEntry.findUnique.mockResolvedValue(baseEntry({ status: 'posted', chequeStatus: 'IN_HAND', voucherId: 'voucher-1' }));
    prisma.paymentEntry.update.mockImplementationOnce(async (args: { data: Record<string, unknown> }) => ({
      ...baseEntry({ status: 'pending' }),
      ...(args.data ?? {}),
      allocations: [],
    }));

    const result = await svc.updateCheque('cheque-1', {
      paymentDate: '2026-09-10T10:00:00Z',
    } as EditChequeDto, 'actor');

    expect(accounting.createVoucher).toHaveBeenCalled();
    expect(prisma.paymentEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ paymentDate: new Date('2026-09-10T10:00:00Z') }) }),
    );
    expect(result).toBeDefined();
  });

  it('locks the bank account after the cheque is cleared', async () => {
    const { svc, prisma } = buildService();
    prisma.paymentEntry.findUnique.mockResolvedValue(baseEntry({ status: 'posted', chequeStatus: 'CLEARED', voucherId: 'voucher-1' }));

    const msg = await apiErrorMessage(
      svc.updateCheque('cheque-1', { bankAccountId: 'bank-2' } as EditChequeDto, 'actor'),
    );
    expect(msg.toLowerCase()).toContain('bank');
  });

  it('rejects amount changes once the cheque has been cleared into the bank', async () => {
    const { svc, prisma } = buildService();
    prisma.paymentEntry.findUnique.mockResolvedValue(baseEntry({ status: 'posted', chequeStatus: 'DEPOSITED', voucherId: 'voucher-1' }));

    const msg = await apiErrorMessage(
      svc.updateCheque('cheque-1', { amount: 2000 } as EditChequeDto, 'actor'),
    );
    expect(msg.toLowerCase()).toContain('cleared');
  });

  it('rejects a bounced cheque edit', async () => {
    const { svc, prisma } = buildService();
    prisma.paymentEntry.findUnique.mockResolvedValue(baseEntry({ status: 'posted', chequeStatus: 'BOUNCED' }));

    const msg = await apiErrorMessage(
      svc.updateCheque('cheque-1', { chequeNumber: '000' } as EditChequeDto, 'actor'),
    );
    expect(msg.toLowerCase()).toContain('bounced');
  });

  it('rejects a cancelled cheque edit', async () => {
    const { svc, prisma } = buildService();
    prisma.paymentEntry.findUnique.mockResolvedValue(baseEntry({ status: 'cancelled' }));

    const msg = await apiErrorMessage(
      svc.updateCheque('cheque-1', { chequeNumber: '000' } as EditChequeDto, 'actor'),
    );
    expect(msg.toLowerCase()).toContain('cancelled');
  });

  it('allows updating the cheque date on a pending post-dated cheque', async () => {
    const { svc, prisma } = buildService();
    prisma.paymentEntry.findUnique.mockResolvedValue(baseEntry({ chequeDate: new Date('2026-10-01') }));

    const result = await svc.updateCheque('cheque-1', {
      chequeDate: '2026-11-01',
    } as EditChequeDto, 'actor');

    expect(result.chequeDate).toBeInstanceOf(Date);
    expect(prisma.paymentEntry.update).toHaveBeenCalledTimes(1);
  });

  it('allows changing the party on a pending cheque', async () => {
    const { svc, prisma } = buildService();
    prisma.paymentEntry.findUnique.mockResolvedValue(baseEntry());

    const result = await svc.updateCheque('cheque-1', {
      partyType: 'SUPPLIER',
      partyId: 'supplier-1',
    } as EditChequeDto, 'actor');

    expect(result.partyId).toBe('supplier-1');
    expect(result.partyName).toBe('Test Supplier');
  });

  it('rejects changing the party while the cheque is allocated', async () => {
    const { svc, prisma } = buildService();
    prisma.paymentEntry.findUnique.mockResolvedValue(
      baseEntry({ allocations: [{ documentType: 'PURCHASE', documentId: 'p-1', allocatedAmount: 800 }] }),
    );
    prisma.supplier.findUnique.mockResolvedValue({ id: 'supplier-2', name: 'Other Supplier' });

    const msg = await apiErrorMessage(
      svc.updateCheque('cheque-1', {
        partyType: 'SUPPLIER',
        partyId: 'supplier-2',
      } as EditChequeDto, 'actor'),
    );
    expect(msg.toLowerCase()).toContain('allocated');
  });

  it('rejects empty cheque number', async () => {
    const { svc, prisma } = buildService();
    prisma.paymentEntry.findUnique.mockResolvedValue(baseEntry());

    const msg = await apiErrorMessage(
      svc.updateCheque('cheque-1', { chequeNumber: '   ' } as EditChequeDto, 'actor'),
    );
    expect(msg.toLowerCase()).toContain('cheque number');
  });

  it('rejects amount lower than the allocated total', async () => {
    const { svc, prisma } = buildService();
    prisma.paymentEntry.findUnique.mockResolvedValue(
      baseEntry({ allocations: [{ documentType: 'PURCHASE', documentId: 'p-1', allocatedAmount: 800 }] }),
    );

    const msg = await apiErrorMessage(
      svc.updateCheque('cheque-1', { amount: 500 } as EditChequeDto, 'actor'),
    );
    expect(msg.toLowerCase()).toContain('allocated');
  });

  it('rejects non-cheque payment entries', async () => {
    const { svc, prisma } = buildService();
    prisma.paymentEntry.findUnique.mockResolvedValue(baseEntry({ method: 'CASH' }));

    const msg = await apiErrorMessage(
      svc.updateCheque('cheque-1', { reference: 'x' } as EditChequeDto, 'actor'),
    );
    expect(msg.toLowerCase()).toContain('cheque');
  });

  it('rejects an empty update', async () => {
    const { svc, prisma } = buildService();
    prisma.paymentEntry.findUnique.mockResolvedValue(baseEntry());

    const msg = await apiErrorMessage(svc.updateCheque('cheque-1', {} as EditChequeDto, 'actor'));
    expect(msg.toLowerCase()).toContain('nothing to update');
  });
});

describe('PaymentsService.updatePayment', () => {
  it('edits a pending cash entry without the cheque-only guard', async () => {
    const { svc, prisma } = buildService();
    prisma.paymentEntry.findUnique.mockResolvedValue(baseEntry({ method: 'CASH', chequeNumber: null }));

    const result = await svc.updatePayment('cheque-1', { reference: 'Fixed note' } as EditChequeDto, 'actor');

    expect(result.reference).toBe('Fixed note');
    expect(prisma.paymentEntry.update).toHaveBeenCalledTimes(1);
  });

  it('corrects the amount of a posted cash entry through reversal and re-post', async () => {
    const { svc, prisma, accounting } = buildService();
    prisma.paymentEntry.findUnique.mockResolvedValue(
      baseEntry({ method: 'CASH', chequeNumber: null, status: 'posted', voucherId: 'voucher-1' }),
    );
    prisma.paymentEntry.update.mockImplementationOnce(async (args: { data: Record<string, unknown> }) => ({
      ...baseEntry({ method: 'CASH', chequeNumber: null, status: 'pending' }),
      ...(args.data ?? {}),
      allocations: [],
    }));

    const result = await svc.updatePayment('cheque-1', {
      amount: 2500,
    } as EditChequeDto, 'actor');

    expect(accounting.createVoucher).toHaveBeenCalled();
    expect(prisma.paymentEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ amount: 2500 }) }),
    );
    expect(result).toBeDefined();
  });

  it('rejects a cancelled cash entry', async () => {
    const { svc, prisma } = buildService();
    prisma.paymentEntry.findUnique.mockResolvedValue(baseEntry({ method: 'CASH', chequeNumber: null, status: 'cancelled' }));

    const msg = await apiErrorMessage(
      svc.updatePayment('cheque-1', { narration: 'x' } as EditChequeDto, 'actor'),
    );
    expect(msg.toLowerCase()).toContain('cancelled');
  });
});

describe('PaymentsService.deposit', () => {
  it('still requires a bank when the entry has none saved and none is passed', async () => {
    const { svc, prisma } = buildService();
    prisma.paymentEntry.findUnique.mockResolvedValue(
      baseEntry({ status: 'posted', chequeStatus: 'IN_HAND', bankAccountId: null }),
    );

    const msg = await apiErrorMessage(svc.deposit('cheque-1', undefined, 'actor'));
    expect(msg.toLowerCase()).toContain('bank account');
  });

  it('accepts a bank account chosen at clear time and persists it', async () => {
    const { svc, prisma } = buildService();
    prisma.paymentEntry.findUnique.mockResolvedValue(
      baseEntry({ status: 'posted', chequeStatus: 'IN_HAND', bankAccountId: null }),
    );
    prisma.bankAccount.findUnique.mockResolvedValue({ id: 'bank-1', name: 'Bank A', mainAccountId: 'bank-gl' });

    const result = await svc.deposit('cheque-1', 'bank-1', 'actor');

    expect(result.bankAccountId).toBe('bank-1');
    expect(prisma.paymentEntry.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ chequeStatus: 'CLEARED', bankAccountId: 'bank-1' }),
      }),
    );
  });
});