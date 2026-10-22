import { describe, it, expect, vi } from 'vitest';
import { InvestorsService } from './investors.service';

function buildService(opts?: { investments?: number; entries?: number; accountCode?: string }) {
  const investments = opts?.investments ?? 0;
  const entries = opts?.entries ?? 0;
  const accountCode = opts?.accountCode ?? 'INV-INV-0001';

  const investor = {
    id: 'inv-1',
    code: 'INV-0001',
    name: 'Mr. Khan',
    mainAccountId: 'acct-1',
    investments: Array.from({ length: investments }, (_, i) => ({ id: `i-${i}`, number: `X-${i}` })),
  };

  const investorDelete = vi.fn().mockResolvedValue({});
  const accountDelete = vi.fn().mockResolvedValue({});
  const tx = { investor: { delete: investorDelete }, mainAccount: { delete: accountDelete } };

  const prisma = {
    investor: { findUnique: vi.fn(async () => investor), delete: investorDelete },
    mainAccount: {
      findUnique: vi.fn(async () => ({ id: 'acct-1', code: accountCode })),
      delete: accountDelete,
    },
    voucherEntry: { count: vi.fn(async () => entries) },
    $transaction: vi.fn(async (fn: (t: unknown) => unknown) => fn(tx)),
  };

  const svc = new InvestorsService(
    prisma as never,
    { record: vi.fn().mockResolvedValue(undefined) } as never,
    { nextSequence: vi.fn().mockResolvedValue(1) } as never,
    { accountBalance: vi.fn().mockResolvedValue(0), syncOpeningVoucher: vi.fn() } as never,
  );

  return { svc, investorDelete, accountDelete };
}

function errorMessage(err: unknown): string {
  const e = err as { getResponse?: () => unknown };
  const resp = (e.getResponse?.() ?? {}) as { error?: { message?: string } };
  return resp.error?.message ?? (err as Error)?.message ?? '';
}

describe('InvestorsService.remove', () => {
  it('takes the account it opened with it when nothing was booked on it', async () => {
    const { svc, investorDelete, accountDelete } = buildService({ entries: 0 });
    await svc.remove('inv-1');

    expect(investorDelete).toHaveBeenCalled();
    expect(accountDelete).toHaveBeenCalledWith({ where: { id: 'acct-1' } });
  });

  it('keeps the account when something has been booked on it', async () => {
    const { svc, accountDelete } = buildService({ entries: 3 });
    await svc.remove('inv-1');

    expect(accountDelete).not.toHaveBeenCalled();
  });

  it('keeps an account that was not opened for this investor', async () => {
    const { svc, accountDelete } = buildService({ entries: 0, accountCode: 'CAP-001' });
    await svc.remove('inv-1');

    expect(accountDelete).not.toHaveBeenCalled();
  });

  it('refuses to remove an investor who still has investments', async () => {
    const { svc, investorDelete } = buildService({ investments: 2 });
    const err = await svc.remove('inv-1').catch((e: unknown) => e);

    expect(errorMessage(err)).toMatch(/cannot be deleted/i);
    expect(investorDelete).not.toHaveBeenCalled();
  });
});
