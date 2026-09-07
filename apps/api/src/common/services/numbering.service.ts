import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Safe sequential numbering for documents (invoices, vouchers, etc.).
 *
 * Numbers are generated collision-free under concurrency and formatted as
 * `PREFIX-YEAR-SEQUENCE`, e.g. `SI-2026-000123`. The counter lives in
 * `SystemSetting` and is advanced with a single atomic `INSERT ... ON CONFLICT
 * DO UPDATE ... RETURNING` statement. PostgreSQL serializes conflicting upsert
 * rows (each concurrent caller waits on the row lock), so two requests can never
 * read the same counter value. Scoping the key by year restarts each series at
 * 000001 for every new financial year.
 */
@Injectable()
export class NumberingService {
  constructor(private readonly prisma: PrismaService) {}

  async next(
    settingKey: string,
    prefix: string,
    tx?: any,
    padLength = 6,
    options: { year?: boolean } = {},
  ): Promise<string> {
    const client = tx ?? this.prisma;
    const useYear = options.year !== false;
    const key = this.scopedKey(settingKey, useYear);
    const rowId =
      typeof globalThis.crypto?.randomUUID === 'function'
        ? globalThis.crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    // Atomic increment. The single-statement upsert is safe under concurrency:
    // PostgreSQL blocks concurrent upserts on the same (key, organizationId)
    // row, and RETURNING always yields the freshly incremented value.
    const rows: { value: string }[] = await client.$queryRawUnsafe(
      `INSERT INTO "SystemSetting" ("id", "key", "value", "organizationId", "updatedAt")
       VALUES ($1, $2, '1', 'default-org', now())
       ON CONFLICT ("key", "organizationId")
       DO UPDATE SET "value" = (
         COALESCE(NULLIF("SystemSetting"."value", '')::int, 0) + 1
       )::text, "updatedAt" = now()
       RETURNING "value"`,
      rowId,
      key,
    );

    const nextValue = Number(rows[0]?.value ?? 1);
    return this.format(prefix, nextValue, padLength, useYear);
  }

  /**
   * Returns the upcoming number WITHOUT reserving it (read-only peek). Useful
   * for showing "next invoice #" in a create form. The value may be off by one
   * under concurrency but is never double-assigned because `next()` performs
   * the atomic increment itself.
   */
  async preview(
    settingKey: string,
    prefix: string,
    padLength = 6,
  ): Promise<string> {
    const key = this.scopedKey(settingKey, true);
    const rows: { value: string }[] = await this.prisma.$queryRawUnsafe(
      `SELECT "value" FROM "SystemSetting"
       WHERE "key" = $1 AND "organizationId" = $2`,
      key,
      'default-org',
    );
    const current = Number(rows[0]?.value ?? 0);
    return this.format(prefix, current + 1, padLength, true);
  }

  private scopedKey(settingKey: string, useYear: boolean): string {
    return useYear
      ? `numbering.${settingKey}.${new Date().getFullYear()}`
      : `numbering.${settingKey}`;
  }

  private format(prefix: string, value: number, padLength: number, useYear: boolean): string {
    if (!useYear) return `${prefix}-${String(value).padStart(padLength, '0')}`;
    return `${prefix}-${new Date().getFullYear()}-${String(value).padStart(padLength, '0')}`;
  }
}