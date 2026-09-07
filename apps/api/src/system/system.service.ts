import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ApiException } from '../common/exceptions/api.exception';
import { ImportSettingsDto, UpdateBrandingDto, UpdateSettingsDto } from './dto/system.dto';

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
];

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
      metadata: { ...dto },
    });
    return branding;
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
    if (dto.values) Object.assign(map, dto.values);

    for (const key of Object.keys(map)) {
      await this.prisma.systemSetting.upsert({
        where: { key_organizationId: { key, organizationId: 'default-org' } },
        create: { key, value: map[key], organizationId: 'default-org' },
        update: { value: map[key] },
      });
    }

    this.audit.record({
      userId: actorId,
      action: 'UPDATE',
      module: 'SYSTEM_SETTINGS',
      entity: 'SystemSetting',
      message: 'System settings updated',
      metadata: map,
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

    for (const key of Object.keys(dto.settings)) {
      await this.prisma.systemSetting.upsert({
        where: { key_organizationId: { key, organizationId: 'default-org' } },
        create: { key, value: String(dto.settings[key] ?? ''), organizationId: 'default-org' },
        update: { value: String(dto.settings[key] ?? '') },
      });
    }

    if (dto.branding && typeof dto.branding === 'object') {
      const source = dto.branding as Record<string, unknown>;
      const data: Record<string, unknown> = {};
      const fields = [
        'businessName', 'shortName', 'logoUrl', 'faviconUrl', 'primaryColor',
        'secondaryColor', 'address', 'phone', 'email', 'ntn',
        'invoiceFooter', 'invoiceTerms', 'reportFooter',
      ] as const;
      for (const field of fields) {
        const value = source[field];
        if (value !== undefined && value !== null) data[field] = String(value);
      }
      const existing = await this.getBranding();
      if (existing) {
        await this.prisma.brandingSetting.update({ where: { id: existing.id }, data });
      } else {
        await this.prisma.brandingSetting.create({ data: { ...data, organizationId: 'default-org' } });
      }
    }

    this.audit.record({
      userId: actorId,
      action: 'RESTORE',
      module: 'SYSTEM_SETTINGS',
      entity: 'SystemSetting',
      message: 'System settings and branding restored from backup',
      metadata: { settingKeys: Object.keys(dto.settings) },
    });

    return { exportedAt: new Date().toISOString(), settings: await this.getSettings(), branding: await this.getBranding() };
  }
}