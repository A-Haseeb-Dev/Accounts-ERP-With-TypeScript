import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ApiException } from '../common/exceptions/api.exception';
import { UpdateBrandingDto, UpdateSettingsDto } from './dto/system.dto';

const SETTING_KEYS = [
  'currency',
  'dateFormat',
  'timezone',
  'numbering.invoicePrefix',
  'numbering.purchasePrefix',
  'numbering.voucherPrefix',
  'inventory.negative_stock',
  'defaults.stockLocationId',
  'defaults.customerId',
  'defaults.supplierId',
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
    if (dto.voucherPrefix !== undefined) map['numbering.voucherPrefix'] = dto.voucherPrefix;
    if (dto.negativeInventory !== undefined) map['inventory.negative_stock'] = dto.negativeInventory;
    if (dto.defaultStockLocationId !== undefined) map['defaults.stockLocationId'] = dto.defaultStockLocationId;
    if (dto.defaultCustomerId !== undefined) map['defaults.customerId'] = dto.defaultCustomerId;
    if (dto.defaultSupplierId !== undefined) map['defaults.supplierId'] = dto.defaultSupplierId;
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
}