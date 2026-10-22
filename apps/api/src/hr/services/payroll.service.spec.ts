import { describe, it, expect, vi } from 'vitest';
import { PayrollService } from './payroll.service';

/**
 * Regression cover for the run header totals.
 *
 * `updateItems` used to sum only the rows present in the request, so editing 3
 * employees on a 50-employee run replaced `totalGross` with the sum of those 3
 * lines. `post` / `disburse` then mixed item-derived entries with that header,
 * producing an unbalanced voucher.
 */
function buildService(items: Record<string, unknown>[]) {
  const payrollItem = {
    update: vi.fn(async ({ where }: { where: { id: string } }) => {
      const found = items.find((i) => i.id === where.id);
      return { ...found };
    }),
    aggregate: vi.fn().mockResolvedValue({ _sum: { grossPay: 0, totalDeduction: 0, netPay: 0 } }),
  };
  const payrollRun = {
    update: vi.fn(async (_args: { data: Record<string, unknown> }) => ({ id: 'run-1', items })),
    findUnique: vi.fn().mockResolvedValue({
      id: 'run-1',
      number: 'PR-0001',
      periodMonth: 9,
      periodYear: 2026,
      payDate: new Date('2026-09-30T00:00:00Z'),
      status: 'draft',
      note: null,
      totalGross: 0,
      totalDeduction: 0,
      totalNet: 0,
      items: items.map((i) => ({
        ...i,
        employee: { id: i.employeeId, fullName: `Emp ${i.employeeId}`, mainAccountId: null, department: null },
      })),
    }),
  };
  const mainAccount = {
    findFirst: vi.fn().mockResolvedValue({ id: 'fund-1', code: 'FUND', name: 'Salary Fund' }),
  };
  const voucher = {
    findUnique: vi.fn().mockResolvedValue({ number: 'JV-000001' }),
  };
  const prisma = {
    payrollItem,
    payrollRun,
    mainAccount,
    voucher,
    $transaction: vi.fn((fn: (tx: unknown) => unknown) =>
      fn({ payrollItem, payrollRun }),
    ),
  };
  const audit = { record: vi.fn() };
  const numbering = { next: vi.fn().mockResolvedValue('JV-000002') };
  const accounting = {
    createVoucher: vi.fn(async (_tx: unknown, _input: { entries: unknown[] }) => ({ id: 'v-1', status: 'draft' })),
    postVoucher: vi.fn(async () => ({ status: 'posted' })),
    cancelVoucher: vi.fn(async () => ({ status: 'cancelled' })),
    accountBalance: vi.fn().mockResolvedValue(1_000_000),
  };
  const defaultAccounts = { resolveAccount: vi.fn().mockResolvedValue('acc-1') };
  const svc = new PayrollService(
    prisma as never,
    audit as never,
    numbering as never,
    accounting as never,
    defaultAccounts as never,
  );
  return { svc, prisma, payrollItem, payrollRun, accounting, mainAccount, defaultAccounts };
}

const line = (id: string, gross: number, deduction = 0) => ({
  id,
  employeeId: id,
  basic: gross,
  allowance: 0,
  overtimeHours: 0,
  overtimeAmount: 0,
  absentDeduction: 0,
  otherDeduction: 0,
  taxDeduction: 0,
  grossPay: gross,
  totalDeduction: deduction,
  netPay: gross - deduction,
});

/** A run as `findOne` returns it, with the employees the vouchers are built from. */
const runWith = (overrides: Record<string, unknown>, items: Record<string, unknown>[]) => ({
  id: 'run-1',
  number: 'PR-0001',
  periodMonth: 9,
  periodYear: 2026,
  payDate: new Date('2026-09-30T00:00:00Z'),
  status: 'draft',
  note: null,
  totalGross: 0,
  totalDeduction: 0,
  totalNet: 0,
  fundingAccountId: 'fund-1',
  ...overrides,
  items: items.map((i) => ({
    ...i,
    employee: {
      id: i.employeeId,
      fullName: `Emp ${i.employeeId}`,
      mainAccountId: null,
      department: null,
      ...(i.employee as Record<string, unknown> | undefined),
    },
  })),
});

const voucherEntries = (createVoucher: unknown, call = 0) => {
  const mock = createVoucher as ReturnType<typeof vi.fn>;
  return (mock.mock.calls[call][1] as { entries: { mainAccountId: string; debit?: number; credit?: number }[] }).entries;
};

describe('PayrollService.updateItems', () => {
  it('sums the whole run, not just the edited rows', async () => {
    const items = [line('i1', 1000), line('i2', 2000), line('i3', 3000)];
    const { svc, payrollItem, payrollRun } = buildService(items);

    // The aggregate stands in for the DB sum over all three rows.
    payrollItem.aggregate.mockResolvedValue({
      _sum: { grossPay: 6000, totalDeduction: 0, netPay: 6000 },
    });

    await svc.updateItems('run-1', { items: [{ id: 'i2', overtimeHours: 2 }] } as never, 'u1');

    const data = payrollRun.update.mock.calls[0][0].data as Record<string, number>;
    expect(data.totalGross).toBe(6000);
    expect(data.totalNet).toBe(6000);
  });

  it('rejects an unknown payroll item id', async () => {
    const { svc } = buildService([line('i1', 1000)]);
    await expect(
      svc.updateItems('run-1', { items: [{ id: 'nope', overtimeHours: 1 }] } as never, 'u1'),
    ).rejects.toBeDefined();
  });

  it('refuses to edit a run that is no longer a draft', async () => {
    const { svc, prisma } = buildService([line('i1', 1000)]);
    (prisma.payrollRun.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'run-1',
      number: 'PR-0001',
      periodMonth: 9,
      periodYear: 2026,
      status: 'posted',
      items: [],
    });

    await expect(
      svc.updateItems('run-1', { items: [{ id: 'i1', overtimeHours: 1 }] } as never, 'u1'),
    ).rejects.toBeDefined();
  });
});

describe('PayrollService posting uses item-derived totals', () => {
  it('books the deductions line from the items even when the header total drifted', async () => {
    const items = [line('i1', 1000, 100), line('i2', 2000, 200)];
    const { svc, prisma, accounting } = buildService(items);
    // Stored header is wrong (only one row was ever summed) — the voucher must
    // still balance off the item lines.
    (prisma.payrollRun.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'run-1',
      number: 'PR-0001',
      periodMonth: 9,
      periodYear: 2026,
      payDate: new Date('2026-09-30T00:00:00Z'),
      status: 'draft',
      totalGross: 1000,
      totalDeduction: 100,
      totalNet: 900,
      items: items.map((i) => ({
        ...i,
        employee: { id: i.employeeId, fullName: `Emp ${i.employeeId}`, mainAccountId: null, department: null },
      })),
    });

    await svc.post('run-1', 'u1');

    const voucher = (accounting.createVoucher as ReturnType<typeof vi.fn>).mock.calls[0][1] as {
      entries: { debit?: number; credit?: number }[];
    };
    const debit = voucher.entries.reduce((s, e) => s + Number(e.debit ?? 0), 0);
    const credit = voucher.entries.reduce((s, e) => s + Number(e.credit ?? 0), 0);
    expect(debit).toBe(3000);
    expect(credit).toBe(3000);
  });

  it('repairs the stored totals when posting', async () => {
    const items = [line('i1', 1000), line('i2', 2000)];
    const { svc, prisma, payrollRun } = buildService(items);
    (prisma.payrollRun.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'run-1',
      number: 'PR-0001',
      periodMonth: 9,
      periodYear: 2026,
      payDate: new Date('2026-09-30T00:00:00Z'),
      status: 'draft',
      totalGross: 1000,
      totalDeduction: 0,
      totalNet: 1000,
      items: items.map((i) => ({
        ...i,
        employee: { id: i.employeeId, fullName: `Emp ${i.employeeId}`, mainAccountId: null, department: null },
      })),
    });

    await svc.post('run-1', 'u1');

    const data = payrollRun.update.mock.calls[0][0].data as Record<string, number>;
    expect(data.totalGross).toBe(3000);
    expect(data.totalNet).toBe(3000);
  });
});

describe('PayrollService funding account guard', () => {
  it('refuses to post when the funding account cannot cover the net pay', async () => {
    const items = [line('i1', 1000), line('i2', 2000)];
    const { svc, prisma, accounting } = buildService(items);
    (accounting.accountBalance as ReturnType<typeof vi.fn>).mockResolvedValue(1000);
    (prisma.payrollRun.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'run-1',
      number: 'PR-0001',
      periodMonth: 9,
      periodYear: 2026,
      payDate: new Date('2026-09-30T00:00:00Z'),
      status: 'draft',
      totalGross: 3000,
      totalDeduction: 0,
      totalNet: 3000,
      fundingAccountId: 'fund-1',
      items: items.map((i) => ({
        ...i,
        employee: { id: i.employeeId, fullName: `Emp ${i.employeeId}`, mainAccountId: null, department: null },
      })),
    });

    const err: any = await svc.post('run-1', 'u1').then(() => null, (e) => e);
    expect(err?.getResponse?.().error?.message).toMatch(/Not enough balance/);
    expect(accounting.createVoucher).not.toHaveBeenCalled();
  });

  it('refuses to post when no funding account is configured', async () => {
    const items = [line('i1', 1000)];
    const { svc, prisma, defaultAccounts } = buildService(items);
    (defaultAccounts.resolveAccount as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (prisma.payrollRun.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'run-1',
      number: 'PR-0001',
      periodMonth: 9,
      periodYear: 2026,
      payDate: new Date('2026-09-30T00:00:00Z'),
      status: 'draft',
      totalGross: 1000,
      totalDeduction: 0,
      totalNet: 1000,
      fundingAccountId: null,
      items: items.map((i) => ({
        ...i,
        employee: { id: i.employeeId, fullName: `Emp ${i.employeeId}`, mainAccountId: null, department: null },
      })),
    });

    const err: any = await svc.post('run-1', 'u1').then(() => null, (e) => e);
    expect(err?.getResponse?.().error?.message).toMatch(/No payroll funding account/);
  });
});

describe('PayrollService disbursement', () => {
  it('pays out of the funding account and clears the employee accounts', async () => {
    const items = [line('i1', 1000, 100), line('i2', 2000, 200)];
    const { svc, prisma, accounting } = buildService(items);
    (prisma.payrollRun.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      runWith(
        { status: 'posted', totalGross: 3000, totalDeduction: 300, totalNet: 2700 },
        items.map((i) => ({ ...i, employee: { mainAccountId: `acc-${i.employeeId}` } })),
      ),
    );

    await svc.disburse('run-1', {} as never, 'u1');

    const entries = voucherEntries(accounting.createVoucher);
    // The money comes out of the funding account...
    expect(entries).toContainEqual(expect.objectContaining({ mainAccountId: 'fund-1', credit: 2700 }));
    // ...and the employee accounts it was credited to at posting are cleared.
    expect(entries).toContainEqual(expect.objectContaining({ mainAccountId: 'acc-i1', debit: 900 }));
    expect(entries).toContainEqual(expect.objectContaining({ mainAccountId: 'acc-i2', debit: 1800 }));
    const debit = entries.reduce((s, e) => s + Number(e.debit ?? 0), 0);
    const credit = entries.reduce((s, e) => s + Number(e.credit ?? 0), 0);
    expect(debit).toBe(2700);
    expect(credit).toBe(2700);
  });

  it('pays out of a named settlement account instead of the funding account', async () => {
    const items = [line('i1', 1000)];
    const { svc, prisma, accounting } = buildService(items);
    (prisma.payrollRun.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      runWith({ status: 'posted', totalGross: 1000, totalDeduction: 0, totalNet: 1000 }, items),
    );
    (prisma.mainAccount.findFirst as ReturnType<typeof vi.fn>).mockImplementation(
      async (args: { where: { id: string } }) =>
        args.where.id === 'bank-acc'
          ? { id: 'bank-acc', code: 'BANK', name: 'Meezan Bank' }
          : { id: 'fund-1', code: 'FUND', name: 'Salary Fund' },
    );

    await svc.disburse('run-1', { settlementAccountId: 'bank-acc' } as never, 'u1');

    const entries = voucherEntries(accounting.createVoucher);
    expect(entries).toContainEqual(expect.objectContaining({ mainAccountId: 'bank-acc', credit: 1000 }));
    expect(entries).not.toContainEqual(expect.objectContaining({ mainAccountId: 'fund-1' }));
  });

  it('refuses to pay out of an account that does not cover the net pay', async () => {
    const items = [line('i1', 1000)];
    const { svc, prisma, accounting } = buildService(items);
    (prisma.payrollRun.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      runWith({ status: 'posted', totalGross: 1000, totalDeduction: 0, totalNet: 1000 }, items),
    );
    (accounting.accountBalance as ReturnType<typeof vi.fn>).mockResolvedValue(500);

    const err: any = await svc.disburse('run-1', {} as never, 'u1').then(() => null, (e) => e);
    expect(err?.getResponse?.().error?.message).toMatch(/Not enough balance/);
    expect(accounting.createVoucher).not.toHaveBeenCalled();
  });
});

describe('PayrollService cancellation', () => {
  it('reverses the payment and the accrual of a paid run', async () => {
    const items = [line('i1', 1000)];
    const { svc, prisma, accounting } = buildService(items);
    (prisma.payrollRun.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      runWith(
        { status: 'posted', voucherId: 'v-accrual', disbursementVoucherId: 'v-disbursement' },
        items,
      ),
    );

    await svc.cancel('run-1', 'wrong month', 'u1');

    const cancelVoucher = accounting.cancelVoucher as ReturnType<typeof vi.fn>;
    expect(cancelVoucher).toHaveBeenCalledTimes(2);
    const reversedIds = cancelVoucher.mock.calls.map((c) => c[1]);
    expect(reversedIds).toContain('v-disbursement');
    expect(reversedIds).toContain('v-accrual');
  });
});

describe('PayrollService item edits', () => {
  it('keeps the configured earning components in the gross pay', async () => {
    const items = [
      {
        ...line('i1', 1500),
        basic: 1000,
        componentBreakdown: [{ name: 'Transport', type: 'EARNING', amount: 500 }],
      },
    ];
    const { svc, prisma, payrollItem } = buildService(items);
    (prisma.payrollRun.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      runWith({ status: 'draft' }, items),
    );

    await svc.updateItems('run-1', { items: [{ id: 'i1', overtimeHours: 0 }] } as never, 'u1');

    const data = (payrollItem.update as ReturnType<typeof vi.fn>).mock.calls[0][0].data as {
      grossPay: number;
    };
    // basic 1000 + transport 500 — the transport allowance must not be lost.
    expect(data.grossPay).toBe(1500);
  });
});
