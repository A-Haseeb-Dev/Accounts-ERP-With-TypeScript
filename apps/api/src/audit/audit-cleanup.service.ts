import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from './audit.service';

export const DEFAULT_AUDIT_RETENTION_DAYS = 90;
const PURGE_BATCH_SIZE = 1000;
const RUN_INTERVAL_MS = 24 * 60 * 60 * 1000; // once a day

/**
 * Enforces the audit-log retention policy. Logs older than the configured
 * `audit.retention_days` setting (default 90) are deleted in batches, both on
 * startup and once a day, so the audit table cannot grow without bound.
 */
@Injectable()
export class AuditCleanupService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(AuditCleanupService.name);
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async onApplicationBootstrap() {
    try {
      await this.purgeExpired();
    } catch (err) {
      this.logger.error(`Initial audit purge failed: ${(err as Error).message}`);
    }
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      void this.purgeExpired();
    }, RUN_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async readRetentionDays(): Promise<number> {
    const setting = await this.prisma.systemSetting.findFirst({
      where: { key: 'audit.retention_days' },
    });
    const days = Number(setting?.value ?? DEFAULT_AUDIT_RETENTION_DAYS);
    return Number.isFinite(days) && days >= 30 ? Math.floor(days) : DEFAULT_AUDIT_RETENTION_DAYS;
  }

  async purgeExpired(overrideDays?: number): Promise<{ deleted: number; retentionDays: number }> {
    const retentionDays =
      overrideDays !== undefined && overrideDays >= 30
        ? Math.floor(overrideDays)
        : await this.readRetentionDays();
    const cutOff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    let deleted = 0;
    for (;;) {
      const ids = await this.prisma.auditLog.findMany({
        where: { createdAt: { lt: cutOff } },
        select: { id: true },
        take: PURGE_BATCH_SIZE,
      });
      if (ids.length === 0) break;
      await this.prisma.auditLog.deleteMany({ where: { id: { in: ids.map((r) => r.id) } } });
      deleted += ids.length;
      if (ids.length < PURGE_BATCH_SIZE) break;
    }

    if (deleted > 0) {
      this.audit.record({
        action: 'PURGE',
        module: 'SYSTEM',
        entity: 'AuditLog',
        message: `Audited record retention: purged ${deleted} audit log(s) older than ${retentionDays} days`,
        metadata: { retentionDays, deleted },
      });
      this.logger.log(`Purged ${deleted} audit log(s) older than ${retentionDays} days`);
    }

    return { deleted, retentionDays };
  }
}