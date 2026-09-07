import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Safe sequential numbering for documents (invoices, vouchers, etc.).
 *
 * Numbers are generated collision-free under concurrency. By default they are
 * formatted as `PREFIX-YEAR-SEQUENCE`, e.g. `SI-2026-000123`, but the format is
 * fully configurable from the Settings page through a template string using the
 * tokens `{prefix}`, `{year}`, `{month}`, `{day}`, `{company}` and `{seq}`
 * (e.g. `{prefix}/{company}-{year}-{seq}`). The sequence padding length is also
 * configurable (`numbering.padding`). Party codes (`CST-000001`) always keep
 * the simple `PREFIX-SEQUENCE` shape.
 *
 * The counter lives in `SystemSetting` and is advanced with a single atomic
 * `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` statement. PostgreSQL
 * serializes conflicting upsert rows (each concurrent caller waits on the row
 * lock), so two requests can never read the same counter value. Scoping the key
 * by year restarts each series at 000001 for every new financial year.
 */
@Injectable()
export class NumberingService {
  private readonly defaultTemplate = '{prefix}-{year}-{seq}';

  /**
   * Maps a numbering setting key to the SystemSetting key holding a user-defined
   * prefix override (set from the Settings page).
   */
  private readonly prefixOverrides: Record<string, string> = {
    sale: 'numbering.invoicePrefix',
    purchase: 'numbering.purchasePrefix',
    sales_return: 'numbering.salesReturnPrefix',
    purchase_return: 'numbering.purchaseReturnPrefix',
    transfer: 'numbering.stockTransferPrefix',
    voucher_journal: 'numbering.voucherPrefix',
    voucher_sale: 'numbering.voucherPrefix',
    voucher_receipt: 'numbering.voucherPrefix',
    voucher_purchase: 'numbering.voucherPrefix',
    voucher_purchase_return: 'numbering.voucherPrefix',
    voucher_sales_return: 'numbering.voucherPrefix',
  };

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
    const nextPrefix = (await this.configuredPrefix(settingKey)) ?? prefix;
    return this.format(nextPrefix, nextValue, padLength, useYear);
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
    const nextPrefix = (await this.configuredPrefix(settingKey)) ?? prefix;
    return this.format(nextPrefix, current + 1, padLength, true);
  }

  private async configuredPrefix(settingKey: string): Promise<string | undefined> {
    const configKey = this.prefixOverrides[settingKey];
    if (!configKey) return undefined;
    const value = await this.readSetting(configKey);
    return value || undefined;
  }

  private async format(
    prefix: string,
    value: number,
    padLength: number,
    useYear: boolean,
  ): Promise<string> {
    // Party codes stay stable forever: PREFIX-SEQUENCE, no year.
    if (!useYear) return `${prefix}-${String(value).padStart(padLength, '0')}`;

    const template = (await this.readSetting('numbering.template')) || this.defaultTemplate;
    const pad = await this.readSettingNumber('numbering.padding', padLength);
    const company = await this.readCompanyName();

    const now = new Date();
    const pad2 = (n: number) => String(n).padStart(2, '0');
    return template
      .replaceAll('{prefix}', prefix)
      .replaceAll('{year}', String(now.getFullYear()))
      .replaceAll('{month}', pad2(now.getMonth() + 1))
      .replaceAll('{day}', pad2(now.getDate()))
      .replaceAll('{company}', company)
      .replaceAll('{seq}', String(value).padStart(pad, '0'));
  }

  private async readSetting(key: string): Promise<string | undefined> {
    const row = await this.prisma.systemSetting.findFirst({ where: { key } });
    return row?.value?.trim() || undefined;
  }

  private async readSettingNumber(key: string, fallback: number): Promise<number> {
    const value = await this.readSetting(key);
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
  }

  private async readCompanyName(): Promise<string> {
    const row = await this.prisma.brandingSetting.findFirst({
      orderBy: { updatedAt: 'desc' },
      select: { shortName: true, businessName: true },
    });
    return row?.shortName?.trim() || row?.businessName?.trim() || '';
  }

  private scopedKey(settingKey: string, useYear: boolean): string {
    return useYear
      ? `numbering.${settingKey}.${new Date().getFullYear()}`
      : `numbering.${settingKey}`;
  }
}