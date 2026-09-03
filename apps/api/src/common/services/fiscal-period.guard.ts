import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ApiException } from '../exceptions/api.exception';

/**
 * Guards accounting/documents against posting or changing data dated inside a
 * closed (locked) fiscal period.
 *
 * An admin publishes a lock by setting the `fiscal.locked_until` system setting
 * to an ISO date (e.g. `2026-08-31`). Any voucher/document that references a
 * date on or before that date is rejected at creation, update, or post time.
 *
 * The check is a best-effort guard (not a replacement for the immutable
 * "draft/posted" lifecycle), and cheap: it reads a single setting row (cached
 * by Prisma where possible).
 */
@Injectable()
export class FiscalPeriodGuard {
  constructor(private readonly prisma: PrismaService) {}

  private static LOCKED_UNTIL_KEY = 'fiscal.locked_until';

  /**
   * Reads the configured fiscal lock boundary (inclusive). Returns null when
   * no lock is configured or the value is not a parseable date.
   */
  async lockedUntil(): Promise<Date | null> {
    const setting = await this.prisma.systemSetting.findFirst({
      where: { key: FiscalPeriodGuard.LOCKED_UNTIL_KEY },
      orderBy: { updatedAt: 'desc' },
      take: 1,
    });
    if (!setting?.value) return null;
    const d = new Date(setting.value);
    if (Number.isNaN(d.getTime())) return null;
    return d;
  }

  /**
   * Throws when `date` falls inside the locked period. `label` is used in the
   * error message to describe the operation (default "date").
   */
  async assertOpen(date: Date | string, label = 'This operation is not allowed'): Promise<void> {
    const lockedUntil = await this.lockedUntil();
    if (!lockedUntil) return;

    const target = new Date(date);
    if (Number.isNaN(target.getTime())) return; // no date to evaluate → allow

    const day = new Date(target.getFullYear(), target.getMonth(), target.getDate());
    const lock = new Date(lockedUntil.getFullYear(), lockedUntil.getMonth(), lockedUntil.getDate());

    if (day.getTime() <= lock.getTime()) {
      throw ApiException.invalidTransaction(
        `${label} for ${day.toISOString().slice(0, 10)}. The fiscal period is locked up to ${lock.toISOString().slice(0, 10)}.`,
      );
    }
  }
}