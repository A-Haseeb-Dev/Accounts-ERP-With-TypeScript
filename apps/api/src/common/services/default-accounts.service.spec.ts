import { describe, it, expect, vi } from 'vitest';
import { DefaultAccountsService } from './default-accounts.service';

interface AccountRow {
  id: string;
  status: string;
}

function buildPrisma(opts: {
  setting?: { value: string | null } | null;
  account?: AccountRow | null;
}) {
  const mainAccount = {
    findFirst: vi.fn(async () => opts.account ?? null),
  };
  const systemSetting = {
    findFirst: vi.fn(async () => opts.setting ?? null),
  };
  const svc = new DefaultAccountsService({ mainAccount, systemSetting } as never);
  return { svc, mainAccount, systemSetting };
}

describe('DefaultAccountsService', () => {
  describe('resolveAccount', () => {
    it('returns the account id recorded in settings', async () => {
      const { svc } = buildPrisma({
        setting: { value: 'acc-cash' },
        account: { id: 'acc-cash', status: 'active' },
      });
      expect(await svc.resolveAccount('accounting.cash_account')).toBe('acc-cash');
    });

    it('returns null when the role was never configured', async () => {
      const { svc } = buildPrisma({ setting: null });
      expect(await svc.resolveAccount('accounting.cash_account')).toBeNull();
    });

    it('returns null when the setting points at a deleted account', async () => {
      const { svc } = buildPrisma({ setting: { value: 'gone' }, account: null });
      expect(await svc.resolveAccount('accounting.cash_account')).toBeNull();
    });

    it('returns null when the setting is empty', async () => {
      const { svc } = buildPrisma({ setting: { value: '' }, account: { id: 'x', status: 'active' } });
      expect(await svc.resolveAccount('accounting.cash_account')).toBeNull();
    });

    it('ignores an account that is no longer active', async () => {
      const { svc } = buildPrisma({ setting: { value: 'acc-old' }, account: null });
      expect(await svc.resolveAccount('accounting.cash_account')).toBeNull();
    });

    it('never falls back to matching an account by name', async () => {
      // Each company names its own accounts, so a name-based fallback would
      // silently post to the wrong account after a rename. With nothing
      // configured the lookup must stop without touching the account table.
      const { svc, mainAccount } = buildPrisma({ setting: null });
      expect(await svc.resolveAccount('accounting.revenue_account')).toBeNull();
      expect(mainAccount.findFirst).toHaveBeenCalledTimes(0);
    });
  });

  describe('resolveAccounts', () => {
    it('resolves each requested role independently', async () => {
      const setting = vi.fn(async ({ where }: { where: { key: string } }) =>
        where.key === 'accounting.cash_account' ? { value: 'acc-cash' } : { value: 'missing' },
      );
      const mainAccount = {
        findFirst: vi.fn(async ({ where }: { where: { id: string } }) =>
          where.id === 'acc-cash' ? { id: 'acc-cash' } : null,
        ),
      };
      const svc = new DefaultAccountsService({ mainAccount, systemSetting: { findFirst: setting } } as never);

      const resolved = await svc.resolveAccounts([
        'accounting.cash_account',
        'accounting.revenue_account',
      ]);
      expect(resolved).toEqual({
        'accounting.cash_account': 'acc-cash',
        'accounting.revenue_account': null,
      });
    });
  });

  describe('boot seeding', () => {
    it('creates no chart of accounts', async () => {
      // The service has no lifecycle hook at all, so a fresh install starts with
      // an empty chart and each company builds its own.
      const svc = new DefaultAccountsService({} as never);
      expect((svc as unknown as { onModuleInit?: unknown }).onModuleInit).toBeUndefined();
    });
  });
});