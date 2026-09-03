import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Safe sequential numbering for documents (invoices, vouchers, etc.).
 *
 * Numbers are generated collision-free under concurrency. The counter lives in
 * `SystemSetting` and is advanced with a single atomic `INSERT ... ON CONFLICT
 * DO UPDATE ... RETURNING` statement. PostgreSQL serializes conflicting upsert
 * rows (each concurrent caller waits on the row lock), so two requests can never
 * read the same counter value.
 */
@Injectable()
export class NumberingService {
  constructor(private readonly prisma: PrismaService) {}

  async next(
    settingKey: string,
    prefix: string,
    tx?: any,
    padLength = 6,
  ): Promise<string> {
    const client = tx ?? this.prisma;
    const key = `numbering.${settingKey}`;
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
    return `${prefix}-${String(nextValue).padStart(padLength, '0')}`;
  }
}