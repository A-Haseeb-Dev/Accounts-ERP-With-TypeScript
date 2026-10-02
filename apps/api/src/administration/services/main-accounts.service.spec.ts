import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MainAccountsService } from './main-accounts.service';
import type { AccountingService } from '../../common/services/accounting.service';

/**
 * Creating a main account used to report failure even though the account was
 * created, because the account row is committed first and the opening balance
 * voucher was posted in a separate transaction that then failed on a foreign
 * key. The account must survive that, with the gap explained.
 */
describe('MainAccountsService opening balance sync', () => {
  const created = {
    id: 'acc-1',
    code: '1101',
    name: 'Cash',
    accountType: 'ASSET',
    openingBalance: 5000,
    openingBalanceType: 'DR',
    openingDate: null,
    status: 'active',
    subHead: { id: 'sh-1', code: '11', headAccount: { id: 'h-1', code: '1' } },
  };

  let syncOpeningVoucher: ReturnType<typeof vi.fn>;
  let prisma: Record<string, any>;
  let svc: MainAccountsService;

  beforeEach(() => {
    syncOpeningVoucher = vi.fn().mockResolvedValue({ posted: true });
    prisma = {
      subHead: {
        findUnique: vi.fn().mockResolvedValue({ id: 'sh-1', code: '11', headAccount: { id: 'h-1', code: '1' } }),
      },
      mainAccount: {
        findFirst: vi.fn().mockResolvedValue(null),
        findUnique: vi.fn().mockResolvedValue({ ...created }),
        create: vi.fn().mockResolvedValue({ ...created }),
        update: vi.fn().mockResolvedValue({ ...created }),
      },
    };
    const audit = { record: vi.fn() };
    const accounting = { syncOpeningVoucher } as unknown as AccountingService;
    svc = new MainAccountsService(prisma as never, audit as never, accounting);
  });

  const dto = {
    code: '1101',
    name: 'Cash',
    subHeadId: 'sh-1',
    openingBalance: 5000,
    openingBalanceType: 'DR' as const,
  };

  it('returns the saved account with no warning when the voucher posts', async () => {
    const result = await svc.create(dto, 'user-1');
    expect(syncOpeningVoucher).toHaveBeenCalledWith('acc-1', 'user-1', null);
    expect((result as { warning?: string }).warning).toBeUndefined();
  });

  it('still saves the account and explains the gap when no equity account exists', async () => {
    syncOpeningVoucher.mockResolvedValue({ posted: false, reason: 'NO_EQUITY_ACCOUNT' });

    const result = (await svc.create(dto, 'user-1')) as { id: string; warning?: string };

    // The account exists - it must not be lost because a follow-up step failed.
    expect(prisma.mainAccount.create).toHaveBeenCalled();
    expect(result.id).toBe('acc-1');
    expect(result.warning).toMatch(/Opening Equity/i);
    expect(result.warning).toMatch(/re-save/i);
  });

  it('does not sync a voucher when the opening balance is zero', async () => {
    await svc.create({ ...dto, openingBalance: 0 }, 'user-1');
    expect(syncOpeningVoucher).not.toHaveBeenCalled();
  });

  it('explains the gap on update without discarding the change', async () => {
    syncOpeningVoucher.mockResolvedValue({ posted: false, reason: 'NO_EQUITY_ACCOUNT' });
    prisma.mainAccount.findUnique
      .mockResolvedValueOnce({ ...created })
      .mockResolvedValueOnce({ ...created, name: 'Cash', openingBalance: 5000 });

    const result = (await svc.update('acc-1', { openingBalance: 7500 }, 'user-1')) as {
      warning?: string;
    };

    expect(prisma.mainAccount.update).toHaveBeenCalled();
    expect(result.warning).toMatch(/Opening Equity/i);
  });
});
