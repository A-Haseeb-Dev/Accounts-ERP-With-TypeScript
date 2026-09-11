import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ApiException } from '../common/exceptions/api.exception';
import { ImportSettingsDto, UpdateBrandingDto, UpdateSettingsDto } from './dto/system.dto';
import { FEATURES } from '../features/feature-catalog';

const SETTING_KEYS = [
  'currency',
  'dateFormat',
  'timezone',
  'numbering.invoicePrefix',
  'numbering.purchasePrefix',
  'numbering.salesReturnPrefix',
  'numbering.purchaseReturnPrefix',
  'numbering.stockTransferPrefix',
  'numbering.voucherPrefix',
  'numbering.template',
  'numbering.padding',
  'inventory.negative_stock',
  'defaults.stockLocationId',
  'defaults.customerId',
  'defaults.supplierId',
  'print.invoiceShowBalance',
  'print.invoiceShowAmountWords',
  'print.invoiceShowDate',
  'print.reportShowBranding',
  'print.reportShowLogo',
  'print.paperSize',
  'print.scale',
  'print.invoiceTemplate',
  'print.layout',
  'print.layoutOverrides',
  'print.layouts',
  'print.fontSize',
  'print.logoSize',
  'print.invoiceShowSignatures',
  'print.invoiceShowPartyContact',
  'print.invoiceShowItemCode',
  'print.invoiceShowDiscountCol',
  'print.invoiceShowTaxCol',
  'print.invoiceHeaderAlign',
  'print.showPageNumbers',
  'audit.retention_days',
  'fiscal.locked_until',
];

// Feature switches are stored in system_settings too, so backups/restores pick
// them up. They are whitelisted by expanding the feature catalog below.
for (const feature of FEATURES) {
  SETTING_KEYS.push(`features.${feature.code}`);
}

@Injectable()
export class SystemService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getBranding() {
    return this.prisma.brandingSetting.findFirst({ orderBy: { updatedAt: 'desc' } });
  }

  async updateBranding(dto: UpdateBrandingDto, actorId?: string) {
    const existing = await this.getBranding();
    const data = {
      businessName: dto.businessName,
      shortName: dto.shortName,
      logoUrl: dto.logoUrl,
      faviconUrl: dto.faviconUrl,
      primaryColor: dto.primaryColor,
      secondaryColor: dto.secondaryColor,
      address: dto.address,
      phone: dto.phone,
      email: dto.email,
      ntn: dto.ntn,
      invoiceFooter: dto.invoiceFooter,
      invoiceTerms: dto.invoiceTerms,
      reportFooter: dto.reportFooter,
      saleFooter: dto.saleFooter,
      saleTerms: dto.saleTerms,
      purchaseFooter: dto.purchaseFooter,
      purchaseTerms: dto.purchaseTerms,
      salesReturnFooter: dto.salesReturnFooter,
      salesReturnTerms: dto.salesReturnTerms,
      purchaseReturnFooter: dto.purchaseReturnFooter,
      purchaseReturnTerms: dto.purchaseReturnTerms,
      updatedById: actorId,
    };

    // Remove undefined fields so they don't overwrite existing values.
    Object.keys(data).forEach((k) => {
      if (data[k as keyof typeof data] === undefined) delete data[k as keyof typeof data];
    });

    const branding = existing
      ? await this.prisma.brandingSetting.update({ where: { id: existing.id }, data })
      : await this.prisma.brandingSetting.create({ data: { ...data, organizationId: 'default-org' } });

    this.audit.record({
      userId: actorId,
      action: 'UPDATE',
      module: 'BRANDING',
      entity: 'BrandingSetting',
      entityId: branding.id,
      message: 'Branding updated',
      metadata: this.maskDataUrls({ ...dto }),
    });
    return branding;
  }

  /** Replaces inline base64 data-URLs (uploaded logos) with a short marker. */
  private maskDataUrls(value: Record<string, string | undefined>): Record<string, string | undefined> {
    const out: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(value)) {
      if (typeof v === 'string' && v.startsWith('data:')) out[k] = '[uploaded image]';
      else out[k] = v;
    }
    return out;
  }

  async getSettings() {
    const settings = await this.prisma.systemSetting.findMany();
    const map: Record<string, string> = {};
    for (const s of settings) map[s.key] = s.value ?? '';
    return map;
  }

  async updateSettings(dto: UpdateSettingsDto, actorId?: string) {
    const map: Record<string, string> = {};
    if (dto.currency !== undefined) map['currency'] = dto.currency;
    if (dto.dateFormat !== undefined) map['dateFormat'] = dto.dateFormat;
    if (dto.timezone !== undefined) map['timezone'] = dto.timezone;
    if (dto.invoicePrefix !== undefined) map['numbering.invoicePrefix'] = dto.invoicePrefix;
    if (dto.purchasePrefix !== undefined) map['numbering.purchasePrefix'] = dto.purchasePrefix;
    if (dto.salesReturnPrefix !== undefined) map['numbering.salesReturnPrefix'] = dto.salesReturnPrefix;
    if (dto.purchaseReturnPrefix !== undefined) map['numbering.purchaseReturnPrefix'] = dto.purchaseReturnPrefix;
    if (dto.stockTransferPrefix !== undefined) map['numbering.stockTransferPrefix'] = dto.stockTransferPrefix;
    if (dto.voucherPrefix !== undefined) map['numbering.voucherPrefix'] = dto.voucherPrefix;
    if (dto.negativeInventory !== undefined) map['inventory.negative_stock'] = dto.negativeInventory;
    if (dto.defaultStockLocationId !== undefined) map['defaults.stockLocationId'] = dto.defaultStockLocationId;
    if (dto.defaultCustomerId !== undefined) map['defaults.customerId'] = dto.defaultCustomerId;
    if (dto.defaultSupplierId !== undefined) map['defaults.supplierId'] = dto.defaultSupplierId;
    if (dto.invoiceShowBalance !== undefined) map['print.invoiceShowBalance'] = dto.invoiceShowBalance;
    if (dto.invoiceShowAmountWords !== undefined) map['print.invoiceShowAmountWords'] = dto.invoiceShowAmountWords;
    if (dto.invoiceShowDate !== undefined) map['print.invoiceShowDate'] = dto.invoiceShowDate;
    if (dto.reportShowBranding !== undefined) map['print.reportShowBranding'] = dto.reportShowBranding;
    if (dto.reportShowLogo !== undefined) map['print.reportShowLogo'] = dto.reportShowLogo;
    if (dto.paperSize !== undefined) map['print.paperSize'] = dto.paperSize;
    if (dto.printScale !== undefined) map['print.scale'] = dto.printScale;
    if (dto.invoiceTemplate !== undefined) map['print.invoiceTemplate'] = dto.invoiceTemplate;
    if (dto.fontSize !== undefined) map['print.fontSize'] = dto.fontSize;
    if (dto.logoSize !== undefined) map['print.logoSize'] = dto.logoSize;
    if (dto.invoiceShowSignatures !== undefined) map['print.invoiceShowSignatures'] = dto.invoiceShowSignatures;
    if (dto.invoiceShowPartyContact !== undefined) map['print.invoiceShowPartyContact'] = dto.invoiceShowPartyContact;
    if (dto.invoiceShowItemCode !== undefined) map['print.invoiceShowItemCode'] = dto.invoiceShowItemCode;
    if (dto.invoiceShowDiscountCol !== undefined) map['print.invoiceShowDiscountCol'] = dto.invoiceShowDiscountCol;
    if (dto.invoiceShowTaxCol !== undefined) map['print.invoiceShowTaxCol'] = dto.invoiceShowTaxCol;
    if (dto.invoiceHeaderAlign !== undefined) map['print.invoiceHeaderAlign'] = dto.invoiceHeaderAlign;
    if (dto.showPageNumbers !== undefined) map['print.showPageNumbers'] = dto.showPageNumbers;
    if (dto.auditRetentionDays !== undefined) map['audit.retention_days'] = dto.auditRetentionDays;
    if (dto.values) {
      // The free-form values map is only ever written for whitelisted keys, so a
      // client cannot inject arbitrary rows into system_settings.
      for (const key of Object.keys(dto.values)) {
        if (SETTING_KEYS.includes(key)) map[key] = String(dto.values[key] ?? '');
      }
    }

    if (Object.keys(map).length === 0) {
      throw ApiException.validation('No valid settings provided to update');
    }

    // Capture the before-image so the audit trail records exactly what changed.
    const existingRows = await this.prisma.systemSetting.findMany({
      where: { key: { in: Object.keys(map) } },
    });
    const before = new Map(existingRows.map((r) => [r.key, r.value ?? '']));

    const changes: Record<string, { from: string | null; to: string }> = {};
    for (const key of Object.keys(map)) {
      const to = map[key];
      const from = before.get(key) ?? null;
      changes[key] = { from, to };
      await this.prisma.systemSetting.upsert({
        where: { key_organizationId: { key, organizationId: 'default-org' } },
        create: { key, value: to, organizationId: 'default-org', updatedById: actorId },
        update: { value: to, updatedById: actorId },
      });
    }

    this.audit.record({
      userId: actorId,
      action: 'UPDATE',
      module: 'SYSTEM_SETTINGS',
      entity: 'SystemSetting',
      message: `System settings updated (${Object.keys(changes).length} key(s))`,
      metadata: { changes },
    });

    return this.getSettings();
  }

  async getSetting(key: string) {
    const setting = await this.prisma.systemSetting.findFirst({ where: { key } });
    if (!setting) throw ApiException.notFound('Setting');
    return setting;
  }

  /**
   * Dumps every system setting (including numbering counters) plus the branding
   * row into a single portable JSON object the owner can download, keep safe,
   * and restore on this or another machine.
   */
  async exportSettings() {
    const rows = await this.prisma.systemSetting.findMany();
    const settings: Record<string, string> = {};
    for (const row of rows) settings[row.key] = row.value ?? '';
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      settings,
      branding: await this.getBranding(),
    };
  }

  /**
   * Imports a previously exported backup: upserts every system setting and the
   * branding row. Existing values are overwritten; unknown keys are created.
   */
  async importSettings(dto: ImportSettingsDto, actorId?: string) {
    if (!dto || typeof dto !== 'object' || typeof dto.settings !== 'object' || dto.settings === null) {
      throw ApiException.validation('Invalid backup file. Expected an object with a "settings" map.');
    }

    const beforeRows = await this.prisma.systemSetting.findMany();
    const before = new Map(beforeRows.map((r) => [r.key, r.value ?? '']));

    // Only whitelisted keys are ever restored from a backup.
    const accepted: Record<string, string> = {};
    for (const key of Object.keys(dto.settings)) {
      if (SETTING_KEYS.includes(key)) accepted[key] = String(dto.settings[key] ?? '');
    }

    const changes: Record<string, { from: string | null; to: string }> = {};
    for (const key of Object.keys(accepted)) {
      changes[key] = { from: before.get(key) ?? null, to: accepted[key] };
      await this.prisma.systemSetting.upsert({
        where: { key_organizationId: { key, organizationId: 'default-org' } },
        create: { key, value: accepted[key], organizationId: 'default-org', updatedById: actorId },
        update: { value: accepted[key], updatedById: actorId },
      });
    }

    if (dto.branding && typeof dto.branding === 'object') {
      const source = dto.branding as Record<string, unknown>;
      const data: Record<string, unknown> = { updatedById: actorId };
      const fields = [
        'businessName', 'shortName', 'logoUrl', 'faviconUrl', 'primaryColor',
        'secondaryColor', 'address', 'phone', 'email', 'ntn',
        'invoiceFooter', 'invoiceTerms', 'reportFooter',
        'saleFooter', 'saleTerms', 'purchaseFooter', 'purchaseTerms',
        'salesReturnFooter', 'salesReturnTerms', 'purchaseReturnFooter', 'purchaseReturnTerms',
      ] as const;
      for (const field of fields) {
        const value = source[field];
        if (value !== undefined && value !== null) data[field] = String(value);
      }
      const existing = await this.getBranding();
      if (existing) {
        await this.prisma.brandingSetting.update({ where: { id: existing.id }, data: data as never });
      } else {
        await this.prisma.brandingSetting.create({ data: { ...data, organizationId: 'default-org' } as never });
      }
    }

    this.audit.record({
      userId: actorId,
      action: 'RESTORE',
      module: 'SYSTEM_SETTINGS',
      entity: 'SystemSetting',
      message: `System settings restored from backup (${Object.keys(changes).length} setting(s))`,
      metadata: { settingKeys: Object.keys(changes), changes },
    });

    return { exportedAt: new Date().toISOString(), settings: await this.getSettings(), branding: await this.getBranding() };
  }
}