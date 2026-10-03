import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MainAccountsService } from './main-accounts.service';
import type { AccountingService } from '../../common/services/accounting.service';
import type { AccountCodeService } from './account-code.service';

/** `ApiException` carries its message inside the response body, not on `.message`. */
async function apiError(p: Promise<unknown>): Promise<{ status: number; code: string; message: string }> {
  try {
    await p;
  } catch (err) {
    const e = err as {
      getResponse?: () => unknown;
      getStatus?: () => number;
      status?: number;
    };
    const resp = (e.getResponse?.() ?? {}) as { error?: { message?: string; code?: string } };
    return {
      status: e.status ?? e.getStatus?.() ?? 0,
      code: resp.error?.code ?? '',
      message: resp.error?.message ?? '',
    };
  }
  throw new Error('Expected an ApiException but none was thrown');
}

/**
 * Two behaviours are covered here:
 *
 * 1. Creating a main account used to report failure even though the account was
 *    created, because the account row is committed first and the opening balance
 *    voucher was posted in a separate transaction that then failed on a foreign
 *    key. The account must survive that, with the gap explained.
 *
 * 2. Codes are assigned by the server from the chart scheme. A client cannot
 *    supply one, so a stored code can never contradict the hierarchy it sits in.
 */
describe('MainAccountsService', () => {
  const created = {
    id: 'acc-1',
    code: 'A1-01-0001',
    name: 'Cash',
    accountType: 'ASSET',
    openingBalance: 5000,
    openingBalanceType: 'DR',
    openingDate: null,
    status: 'active',
    subHead: { id: 'sh-1', code: 'A1-01', headAccount: { id: 'h-1', code: 'A1' } },
  };

  let syncOpeningVoucher: ReturnType<typeof vi.fn>;
  let nextMainAccountCode: ReturnType<typeof vi.fn>;
  let prisma: Record<string, any>;
  let tx: Record<string, any>;
  let svc: MainAccountsService;

  const codes = () =>
    ({
      nextMainAccountCode,
      previewMainAccountCode: vi.fn().mockResolvedValue('A1-01-0001'),
      accountTypeForHeadCode: vi.fn((code: string) =>
        code.trim().charAt(0).toUpperCase() === 'A' ? 'ASSET' : 'LIABILITY',
      ),
    }) as unknown as AccountCodeService;

  beforeEach(() => {
    syncOpeningVoucher = vi.fn().mockResolvedValue({ posted: true });
    nextMainAccountCode = vi.fn().mockResolvedValue('A1-01-0001');
    tx = {
      mainAccount: {
        create: vi.fn().mockResolvedValue({ ...created }),
        update: vi.fn().mockResolvedValue({ ...created }),
      },
    };
    prisma = {
      subHead: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'sh-1',
          code: 'A1-01',
          headAccount: { id: 'h-1', code: 'A1' },
        }),
      },
      mainAccount: {
        findFirst: vi.fn().mockResolvedValue(null),
        findUnique: vi.fn().mockResolvedValue({ ...created }),
        create: vi.fn(),
        update: vi.fn().mockResolvedValue({ ...created }),
      },
      $transaction: vi.fn().mockImplementation((fn: (t: unknown) => unknown) => fn(tx)),
    };
    const audit = { record: vi.fn() };
    const accounting = { syncOpeningVoucher } as unknown as AccountingService;
    svc = new MainAccountsService(prisma as never, audit as never, accounting, codes());
  });

  const dto = {
    name: 'Cash',
    subHeadId: 'sh-1',
    openingBalance: 5000,
    openingBalanceType: 'DR' as const,
  };

  describe('code generation', () => {
    it('assigns the code from the sub head rather than accepting one', async () => {
      await svc.create(dto, 'user-1');

      expect(nextMainAccountCode).toHaveBeenCalledWith('A1-01', expect.anything());
      const data = tx.mainAccount.create.mock.calls[0][0].data;
      expect(data.code).toBe('A1-01-0001');
    });

    it('derives the account type from the head so it cannot contradict it', async () => {
      await svc.create(dto, 'user-1');

      const data = tx.mainAccount.create.mock.calls[0][0].data;
      expect(data.accountType).toBe('ASSET');
      // Whatever the client claimed is gone; the DTO does not even accept it.
      expect(data.accountType).not.toBe('REVENUE');
    });

    it('derives the type from the head the account is actually filed under', async () => {
      prisma.subHead.findUnique.mockResolvedValue({
        id: 'sh-2',
        code: 'L1-01',
        headAccount: { id: 'h-2', code: 'L1' },
      });

      await svc.create(dto, 'user-1');

      expect(tx.mainAccount.create.mock.calls[0][0].data.accountType).toBe('LIABILITY');
    });

    it('rejects a create for a sub head that does not exist', async () => {
      prisma.subHead.findUnique.mockResolvedValue(null);
      const err = await apiError(svc.create(dto, 'user-1'));
      expect(err.status).toBe(404);
      expect(err.message).toMatch(/Sub head not found/);
      expect(tx.mainAccount.create).not.toHaveBeenCalled();
    });
  });

  describe('opening balance sync', () => {
    it('returns the saved account with no warning when the voucher posts', async () => {
      const result = await svc.create(dto, 'user-1');
      expect(syncOpeningVoucher).toHaveBeenCalledWith('acc-1', 'user-1', null);
      expect((result as { warning?: string }).warning).toBeUndefined();
    });

    it('still saves the account and explains the gap when no equity account exists', async () => {
      syncOpeningVoucher.mockResolvedValue({ posted: false, reason: 'NO_EQUITY_ACCOUNT' });

      const result = (await svc.create(dto, 'user-1')) as { id: string; warning?: string };

      // The account exists - it must not be lost because a follow-up step failed.
      expect(tx.mainAccount.create).toHaveBeenCalled();
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
      prisma.mainAccount.findUnique.mockResolvedValue({ ...created });

      const result = (await svc.update('acc-1', { openingBalance: 7500 }, 'user-1')) as {
        warning?: string;
      };

      expect(prisma.mainAccount.update).toHaveBeenCalled();
      expect(result.warning).toMatch(/Opening Equity/i);
    });
  });

  describe('moving an account to another sub head', () => {
    it('renumbers the account and follows the new head type', async () => {
      nextMainAccountCode.mockResolvedValue('L1-01-0001');
      prisma.subHead.findUnique.mockResolvedValue({
        id: 'sh-2',
        code: 'L1-01',
        headAccount: { id: 'h-2', code: 'L1' },
      });
      prisma.mainAccount.findUnique.mockResolvedValue({ ...created, subHeadId: 'sh-1' });

      await svc.update('acc-1', { subHeadId: 'sh-2' }, 'user-1');

      expect(nextMainAccountCode).toHaveBeenCalledWith('L1-01');
      const data = prisma.mainAccount.update.mock.calls[0][0].data;
      expect(data.code).toBe('L1-01-0001');
      expect(data.accountType).toBe('LIABILITY');
    });

    it('keeps the code when the account is saved under the same sub head', async () => {
      prisma.mainAccount.findUnique.mockResolvedValue({ ...created, subHeadId: 'sh-1' });

      await svc.update('acc-1', { subHeadId: 'sh-1' }, 'user-1');

      expect(nextMainAccountCode).not.toHaveBeenCalled();
      const data = prisma.mainAccount.update.mock.calls[0][0].data;
      expect(data.code).toBeUndefined();
    });

    it('does not renumber for an ordinary edit', async () => {
      await svc.update('acc-1', { name: 'Cash in hand' }, 'user-1');
      const data = prisma.mainAccount.update.mock.calls[0][0].data;
      expect(data.code).toBeUndefined();
      expect(data.accountType).toBeUndefined();
    });
  });
});
