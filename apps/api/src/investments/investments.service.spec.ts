import { describe, it, expect, vi } from 'vitest';
import { InvestmentsService } from './investments.service';
import type { VoucherEntryInput } from '../common/services/accounting.service';

const FUNDING = 'acct-bank';
const CAPITAL = 'acct-capital';
const RETURN_EXPENSE = 'acct-return-expense';

/**
 * An investment is three balanced vouchers: the principal comes in, the
 * monthly returns go out, and the principal comes back. These tests pin the
 * debit and credit sides of each one, and the rule that the principal is only
 * returned once.
 */
function buildService(opts?: {
  principalPaid?: number;
  received?: boolean;
  fundingBalance?: number;
}) {
  const principalPaid = opts?.principalPaid ?? 0;
  const received = opts?.received ?? true;

  const investor = {
    id: 'inv-2',
    code: 'INV-0001',
    name: 'Mr. Khan',
    status: 'active',
    mainAccountId: CAPITAL,
  };

  const installments = [
    { id: 'inst-1', sequence: 1, kind: 'RETURN', dueDate: new Date('2026-02-01'), amount: 500, status: 'pending' },
    { id: 'inst-2', sequence: 2, kind: 'RETURN', dueDate: new Date('2026-03-01'), amount: 500, status: 'pending' },
    { id: 'inst-3', sequence: 3, kind: 'RETURN', dueDate: new Date('2026-04-01'), amount: 500, status: 'pending' },
    {
      id: 'inst-4',
      sequence: 4,
      kind: 'PRINCIPAL',
      dueDate: new Date('2026-04-01'),
      // A principal installment that was paid back carries the amount that was
      // actually returned, which may be less than the original principal.
      amount: principalPaid > 0 ? principalPaid : 10000,
      status: principalPaid > 0 ? 'paid' : 'pending',
      paidAt: principalPaid > 0 ? new Date('2026-04-01') : null,
    },
  ];

  const investment = {
    id: 'inv-1',
    number: 'INV-0001',
    investorId: investor.id,
    principal: 10000,
    startDate: new Date('2026-01-01'),
    termMonths: 3,
    returnType: 'FIXED',
    monthlyReturn: 500,
    profitSharePercent: 0,
    totalReturn: 1500,
    status: received ? 'active' : 'planned',
    receivedAt: received ? new Date('2026-01-01') : null,
    fundingAccountId: FUNDING,
    capitalAccountId: CAPITAL,
    returnExpenseAccountId: RETURN_EXPENSE,
    investor,
    fundingAccount: { id: FUNDING, code: 'BANK', name: 'Bank' },
    capitalAccount: { id: CAPITAL, code: 'CAP', name: 'Capital' },
    returnExpenseAccount: { id: RETURN_EXPENSE, code: 'REXP', name: 'Return Expense' },
    installments,
  };

  const accounts: Record<string, { id: string; code: string; name: string; status: string }> = {
    [FUNDING]: { id: FUNDING, code: 'BANK', name: 'Bank', status: 'active' },
    [CAPITAL]: { id: CAPITAL, code: 'CAP', name: 'Capital', status: 'active' },
    [RETURN_EXPENSE]: { id: RETURN_EXPENSE, code: 'REXP', name: 'Return Expense', status: 'active' },
  };

  const investmentUpdate = vi.fn().mockImplementation(async (args: any) => ({
    ...investment,
    ...args.data,
  }));
  const installmentUpdate = vi.fn().mockResolvedValue({});
  const installmentUpdateMany = vi.fn().mockResolvedValue({ count: 0 });
  const investmentCreate = vi.fn().mockImplementation(async (args: any) => ({
    ...investment,
    ...args.data,
    installments: args.data.installments?.create ?? [],
  }));

  const tx = {
    investment: { update: investmentUpdate, findUnique: vi.fn(async () => investment), create: investmentCreate },
    investmentInstallment: { update: installmentUpdate, updateMany: installmentUpdateMany },
  };

  const prisma = {
    investor: { findUnique: vi.fn(async () => investor) },
    mainAccount: {
      findUnique: vi.fn(async (args: any) => accounts[args.where.id] ?? null),
    },
    investment: {
      findUnique: vi.fn(async () => investment),
      create: investmentCreate,
      update: investmentUpdate,
    },
    investmentInstallment: { update: installmentUpdate, updateMany: installmentUpdateMany },
    systemSetting: { findFirst: vi.fn().mockResolvedValue(null) },
    runInTransaction: vi.fn(async (fn: (t: unknown) => unknown) => fn(tx)),
  };

  const createVoucher = vi.fn().mockResolvedValue({ id: 'v-1' });
  const accounting = {
    createVoucher,
    postVoucher: vi.fn().mockResolvedValue(undefined),
    accountBalance: vi.fn(async () => opts?.fundingBalance ?? 100000),
  };

  const defaultAccounts = {
    resolveAccount: vi.fn(async (key: string) => {
      if (key === 'accounting.investment_capital_account') return CAPITAL;
      if (key === 'accounting.investment_return_expense_account') return RETURN_EXPENSE;
      return null;
    }),
  };

  const svc = new InvestmentsService(
    prisma as never,
    { record: vi.fn().mockResolvedValue(undefined) } as never,
    {
      next: vi.fn().mockResolvedValue('INV-0001'),
      preview: vi.fn().mockReturnValue('INV-0001'),
    } as never,
    accounting as never,
    defaultAccounts as never,
    { assertOpen: vi.fn().mockResolvedValue(undefined) } as never,
  );

  return {
    svc,
    createVoucher,
    installmentUpdate,
    installmentUpdateMany,
    investmentCreate,
    investmentUpdate,
    investment,
    installments,
  };
}

function entriesOf(createVoucher: ReturnType<typeof vi.fn>): VoucherEntryInput[] {
  return createVoucher.mock.calls[0][1].entries as VoucherEntryInput[];
}

function errorMessage(err: unknown): string {
  const e = err as { getResponse?: () => unknown };
  const resp = (e.getResponse?.() ?? {}) as { error?: { message?: string } };
  return resp.error?.message ?? (err as Error)?.message ?? '';
}

describe('InvestmentsService.create', () => {
  it('builds a schedule of monthly returns and a final principal', async () => {
    const { svc, investmentCreate } = buildService({ received: false });
    await svc.create({
      investorId: 'inv-2',
      principal: 10000,
      termMonths: 3,
      monthlyReturn: 500,
      fundingAccountId: FUNDING,
    });

    const schedule = investmentCreate.mock.calls[0][0].data.installments.create;
    expect(schedule).toHaveLength(4);
    expect(schedule.filter((s: any) => s.kind === 'RETURN')).toHaveLength(3);
    expect(schedule[schedule.length - 1]).toMatchObject({ kind: 'PRINCIPAL', amount: 10000 });
    expect(investmentCreate.mock.calls[0][0].data.status).toBe('planned');
  });

  it('refuses a fixed return with no amount', async () => {
    const { svc } = buildService({ received: false });
    const err = await svc
      .create({ investorId: 'inv-2', principal: 10000, termMonths: 3 })
      .catch((e: unknown) => e);
    expect(errorMessage(err)).toMatch(/monthly return/i);
  });
});

describe('InvestmentsService.receive', () => {
  it('debits the funding account and credits the capital account', async () => {
    const { svc, createVoucher } = buildService({ received: false });
    await svc.receive('inv-1', {});

    const entries = entriesOf(createVoucher);
    expect(Number(entries.find((e) => e.mainAccountId === FUNDING)!.debit)).toBe(10000);
    expect(Number(entries.find((e) => e.mainAccountId === CAPITAL)!.credit)).toBe(10000);
  });

  it('refuses a second receipt', async () => {
    const { svc } = buildService({ received: true });
    const err = await svc.receive('inv-1', {}).catch((e: unknown) => e);
    expect(errorMessage(err)).toMatch(/already been received/i);
  });
});

describe('InvestmentsService.payInstallment', () => {
  it('charges the return to the expense account and pays out of the funding account', async () => {
    const { svc, createVoucher, installmentUpdate } = buildService();
    await svc.payInstallment('inv-1', 'inst-1', { amount: 500 });

    const entries = entriesOf(createVoucher);
    expect(Number(entries.find((e) => e.mainAccountId === RETURN_EXPENSE)!.debit)).toBe(500);
    expect(Number(entries.find((e) => e.mainAccountId === FUNDING)!.credit)).toBe(500);
    expect(installmentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'inst-1' },
        data: expect.objectContaining({ status: 'paid', amount: 500 }),
      }),
    );
  });

  it('returns the principal out of the capital account', async () => {
    const { svc, createVoucher } = buildService();
    await svc.payInstallment('inv-1', 'inst-4', { amount: 10000 });

    const entries = entriesOf(createVoucher);
    expect(Number(entries.find((e) => e.mainAccountId === CAPITAL)!.debit)).toBe(10000);
    expect(Number(entries.find((e) => e.mainAccountId === FUNDING)!.credit)).toBe(10000);
  });

  it('refuses to pay an installment before the money was received', async () => {
    const { svc } = buildService({ received: false });
    const err = await svc
      .payInstallment('inv-1', 'inst-1', { amount: 500 })
      .catch((e: unknown) => e);
    expect(errorMessage(err)).toMatch(/not been received/i);
  });

  it('refuses to pay more than the funding account holds', async () => {
    const { svc } = buildService({ fundingBalance: 100 });
    const err = await svc
      .payInstallment('inv-1', 'inst-1', { amount: 500 })
      .catch((e: unknown) => e);
    expect(errorMessage(err)).toMatch(/Not enough balance/i);
  });
});

describe('InvestmentsService.close', () => {
  it('returns the whole principal when nothing of it was paid back', async () => {
    const { svc, createVoucher, installmentUpdateMany } = buildService();
    await svc.close('inv-1', {});

    const entries = entriesOf(createVoucher);
    expect(Number(entries.find((e) => e.mainAccountId === CAPITAL)!.debit)).toBe(10000);
    expect(Number(entries.find((e) => e.mainAccountId === FUNDING)!.credit)).toBe(10000);
    expect(installmentUpdateMany).toHaveBeenCalled();
  });

  it('returns only what is still owed when part of the principal was paid back', async () => {
    const { svc, createVoucher } = buildService({ principalPaid: 4000 });
    await svc.close('inv-1', {});

    const entries = entriesOf(createVoucher);
    expect(Number(entries.find((e) => e.mainAccountId === CAPITAL)!.debit)).toBe(6000);
    expect(Number(entries.find((e) => e.mainAccountId === FUNDING)!.credit)).toBe(6000);
  });

  it('refuses to close an investment that never received money', async () => {
    const { svc } = buildService({ received: false });
    const err = await svc.close('inv-1', {}).catch((e: unknown) => e);
    expect(errorMessage(err)).toMatch(/nothing to return/i);
  });
});
