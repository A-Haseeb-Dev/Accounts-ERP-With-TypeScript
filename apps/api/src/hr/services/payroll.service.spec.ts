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
  const prisma = {
    payrollItem,
    payrollRun,
    $transaction: vi.fn((fn: (tx: unknown) => unknown) =>
      fn({ payrollItem, payrollRun }),
    ),
  };
  const audit = { record: vi.fn() };
  const numbering = { next: vi.fn().mockResolvedValue('JV-000002') };
  const accounting = {
    createVoucher: vi.fn(async (_tx: unknown, _input: { entries: unknown[] }) => ({ id: 'v-1', status: 'draft' })),
    postVoucher: vi.fn(async () => ({ status: 'posted' })),
  };
  const defaultAccounts = { resolveAccount: vi.fn().mockResolvedValue('acc-1') };
  const svc = new PayrollService(
    prisma as never,
    audit as never,
    numbering as never,
    accounting as never,
    defaultAccounts as never,
  );
  return { svc, prisma, payrollItem, payrollRun, accounting };
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
