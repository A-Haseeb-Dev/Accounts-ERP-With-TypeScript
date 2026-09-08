import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ApiException } from '../common/exceptions/api.exception';
import { FEATURES } from './feature-catalog';

export interface FeatureFlagState {
  code: string;
  label: string;
  description: string;
  enabled: boolean;
}

const FEATURE_KEY = (code: string) => `features.${code}`;

@Injectable()
export class FeaturesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Builds the full feature list with the current switch state (on by default). */
  async getState(): Promise<FeatureFlagState[]> {
    const rows = await this.prisma.systemSetting.findMany({
      where: { key: { startsWith: 'features.' } },
    });
    const map = new Map(rows.map((r) => [r.key, r.value ?? '']));

    return FEATURES.map((feature) => ({
      code: feature.code,
      label: feature.label,
      description: feature.description,
      enabled: (map.get(FEATURE_KEY(feature.code)) ?? 'on') !== 'off',
    }));
  }

  /** Whether a feature is enabled for this company. Disabled features are blocked in the permissions guard. */
  async isEnabled(code: string): Promise<boolean> {
    if (!FEATURES.some((f) => f.code === code)) return true;

    const row = await this.prisma.systemSetting.findFirst({
      where: { key: FEATURE_KEY(code) },
    });
    return (row?.value ?? 'on') !== 'off';
  }

  /** Turns a feature on/off and records the change in the audit trail. */
  async setEnabled(code: string, enabled: boolean, actorId?: string): Promise<FeatureFlagState[]> {
    const feature = FEATURES.find((f) => f.code === code);
    if (!feature) throw ApiException.notFound('Feature');

    const key = FEATURE_KEY(code);
    const to = enabled ? 'on' : 'off';

    const existing = await this.prisma.systemSetting.findFirst({ where: { key } });
    const from = existing?.value ?? 'on';

    await this.prisma.systemSetting.upsert({
      where: { key_organizationId: { key, organizationId: 'default-org' } },
      create: { key, value: to, organizationId: 'default-org', updatedById: actorId },
      update: { value: to, updatedById: actorId },
    });

    this.audit.record({
      userId: actorId,
      action: 'UPDATE',
      module: 'SYSTEM_SETTINGS',
      entity: 'SystemSetting',
      message: `Feature "${feature.label}" ${enabled ? 'enabled' : 'disabled'} for this company`,
      metadata: { [key]: { from, to } },
    });

    return this.getState();
  }
}