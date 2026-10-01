import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Resolves the accounts that the transaction engine posts to.
 *
 * The chart of accounts itself is *not* seeded: every company builds its own
 * head / sub-head / main accounts, and its own naming, so nothing here may
 * assume a particular code or label exists.
 *
 * Instead, each role the posting engine needs is bound to one of the company's
 * own main accounts through an `accounting.*` system setting. Administrators
 * set these once in Settings > Accounting. `resolveAccount` is the single
 * lookup every service uses.
 */
@Injectable()
export class DefaultAccountsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolves a configured account id from system settings.
   *
   * Returns `null` when the setting is missing or points at an account that no
   * longer exists - callers treat that as "not configured" and either block with
   * a clear message or degrade gracefully. There is deliberately no name
   * fallback: matching accounts by their English label would silently re-bind
   * the ledger to the wrong account as soon as a company renames something.
   */
  async resolveAccount(settingKey: string): Promise<string | null> {
    const setting = await this.prisma.systemSetting.findFirst({
      where: { key: settingKey },
      select: { value: true },
    });
    if (!setting?.value) return null;

    const account = await this.prisma.mainAccount.findFirst({
      where: { id: setting.value, status: 'active' },
      select: { id: true },
    });
    return account?.id ?? null;
  }

  /**
   * Resolves several roles at once, skipping the lookups entirely when a caller
   * already knows one of them failed. Used by the posting services that need
   * more than one account for a single document.
   */
  async resolveAccounts(settingKeys: string[]): Promise<Record<string, string | null>> {
    const resolved: Record<string, string | null> = {};
    for (const key of settingKeys) {
      resolved[key] = await this.resolveAccount(key);
    }
    return resolved;
  }
}