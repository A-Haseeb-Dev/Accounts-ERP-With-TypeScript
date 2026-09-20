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
  const prisma = {
    paymentEntry,
    bankAccount: { ...bankAccount, ...(overrides?.bankAccount ?? {}) },
  };
  const audit = { record: vi.fn().mockResolvedValue(undefined) };
  const numbering = { next: vi.fn().mockResolvedValue('PN-000001') };
  const accounting = {};
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
  return { svc, prisma, audit, fiscal };
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

  it('rejects amount correction once the entry is posted', async () => {
    const { svc, prisma } = buildService();
    prisma.paymentEntry.findUnique.mockResolvedValue(baseEntry({ status: 'posted', chequeStatus: 'IN_HAND' }));

    const msg = await apiErrorMessage(
      svc.updateCheque('cheque-1', { amount: 2500 } as EditChequeDto, 'actor'),
    );
    expect(msg.toLowerCase()).toContain('amount');
  });

  it('rejects payment date correction once the entry is posted', async () => {
    const { svc, prisma } = buildService();
    prisma.paymentEntry.findUnique.mockResolvedValue(baseEntry({ status: 'posted', chequeStatus: 'IN_HAND' }));

    const msg = await apiErrorMessage(
      svc.updateCheque('cheque-1', { paymentDate: '2026-09-05T10:00:00Z' } as EditChequeDto, 'actor'),
    );
    expect(msg.toLowerCase()).toContain('payment date');
  });

  it('locks the bank account after the cheque is cleared', async () => {
    const { svc, prisma } = buildService();
    prisma.paymentEntry.findUnique.mockResolvedValue(baseEntry({ status: 'posted', chequeStatus: 'CLEARED' }));

    const msg = await apiErrorMessage(
      svc.updateCheque('cheque-1', { bankAccountId: 'bank-2' } as EditChequeDto, 'actor'),
    );
    expect(msg.toLowerCase()).toContain('bank');
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

  it('rejects flipping a cheque between post-dated and regular', async () => {
    const { svc, prisma } = buildService();
    prisma.paymentEntry.findUnique.mockResolvedValue(baseEntry({ chequeDate: new Date('2026-10-01') }));

    const msg = await apiErrorMessage(
      svc.updateCheque('cheque-1', { chequeDate: '' } as EditChequeDto, 'actor'),
    );
    expect(msg.toLowerCase()).toContain('post-dated');
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