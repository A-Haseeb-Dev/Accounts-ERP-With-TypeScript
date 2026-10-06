import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ApiException } from '../common/exceptions/api.exception';
import { FEATURES, isKnownFeature } from './feature-catalog';

export interface FeatureFlagState {
  code: string;
  label: string;
  description: string;
  group: string;
  resource: string;
  action: string;
  enabled: boolean;
}

const FEATURE_KEY = (code: string) => `features.${code}`;

/**
 * Fallback organization for a switch that has never been written. Every model
 * in the schema defaults to the same value, so this matches a freshly seeded
 * install rather than inventing a new one. Real requests always pass the
 * caller's organization; this only covers internal callers with no user.
 */
const DEFAULT_ORGANIZATION_ID = 'default-org';

/** Feature-code prefix for department toggles. Each department is a company feature. */
export const DEPARTMENT_FEATURE_PREFIX = 'hr.departments.';

function isDepartmentFeatureCode(code: string): boolean {
  return code.startsWith(DEPARTMENT_FEATURE_PREFIX) && code.length > DEPARTMENT_FEATURE_PREFIX.length;
}

@Injectable()
export class FeaturesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Builds the full feature list with the current switch state (on by default).
   *
   * Scoped to `organizationId`: `SystemSetting` is unique per (key,
   * organization), so an unscoped read could return another company's row and
   * make this company appear to have disabled a feature it never touched.
   */
  async getState(organizationId?: string): Promise<FeatureFlagState[]> {
    const org = organizationId ?? DEFAULT_ORGANIZATION_ID;
    const rows = await this.prisma.systemSetting.findMany({
      where: { key: { startsWith: 'features.' }, organizationId: org },
    });
    const map = new Map(rows.map((r) => [r.key, r.value ?? '']));

    // Static permission-based features.
    const features: FeatureFlagState[] = FEATURES.map((feature) => ({
      code: feature.code,
      label: feature.label,
      description: feature.description,
      group: feature.group,
      resource: feature.resource,
      action: feature.action,
      enabled: (map.get(FEATURE_KEY(feature.code)) ?? 'on') !== 'off',
    }));

    // Every department is also a company feature ("Departments" group) so that
    // a client can turn any department on/off and it disappears from the app.
    const departments = await this.prisma.department.findMany({
      where: { status: 'active', organizationId: org },
      orderBy: { name: 'asc' },
    });
    for (const dept of departments) {
      const code = `${DEPARTMENT_FEATURE_PREFIX}${dept.id}`;
      features.push({
        code,
        label: `${dept.name} — Department`,
        description: `Show the "${dept.name}" department in this company`,
        group: 'Departments',
        resource: dept.name,
        action: 'Department',
        enabled: (map.get(FEATURE_KEY(code)) ?? 'on') !== 'off',
      });
    }

    return features;
  }

  /** Whether a feature is enabled for this company. Disabled features are blocked in the permissions guard. */
  async isEnabled(code: string, organizationId?: string): Promise<boolean> {
    // An unknown code has no switch to read, so it cannot be "off".
    if (!isKnownFeature(code) && !isDepartmentFeatureCode(code)) return true;

    const row = await this.prisma.systemSetting.findFirst({
      where: { key: FEATURE_KEY(code), organizationId: organizationId ?? DEFAULT_ORGANIZATION_ID },
    });
    return (row?.value ?? 'on') !== 'off';
  }

  /** Turns a feature on/off and records the change in the audit trail. */
  async setEnabled(
    code: string,
    enabled: boolean,
    actorId?: string,
    organizationId?: string,
  ): Promise<FeatureFlagState[]> {
    const label = await this.featureLabel(code);
    if (!label) throw ApiException.notFound('Feature');

    const key = FEATURE_KEY(code);
    const to = enabled ? 'on' : 'off';
    const org = organizationId ?? DEFAULT_ORGANIZATION_ID;

    // Read and write the same (key, organization) pair. Looking the key up
    // unscoped to discover which organization owns it would let this caller's
    // write land on - or overwrite - another company's row.
    const existing = await this.prisma.systemSetting.findFirst({ where: { key, organizationId: org } });
    const from = existing?.value ?? 'on';

    await this.prisma.systemSetting.upsert({
      where: { key_organizationId: { key, organizationId: org } },
      create: { key, value: to, organizationId: org, updatedById: actorId },
      update: { value: to, updatedById: actorId },
    });

    this.audit.record({
      userId: actorId,
      action: 'UPDATE',
      module: 'SYSTEM_SETTINGS',
      entity: 'SystemSetting',
      message: `Feature "${label}" ${enabled ? 'enabled' : 'disabled'} for this company`,
      metadata: { [key]: { from, to } },
    });

    return this.getState(org);
  }

  /** Turns many features on/off in a single transaction (group / bulk switch). */
  async setManyEnabled(
    codes: string[],
    enabled: boolean,
    actorId?: string,
    organizationId?: string,
  ): Promise<FeatureFlagState[]> {
    const valid = Array.from(new Set(codes)).filter((code) =>
      FEATURES.some((f) => f.code === code) || isDepartmentFeatureCode(code),
    );
    const org = organizationId ?? DEFAULT_ORGANIZATION_ID;
    if (valid.length === 0) return this.getState(org);

    const to = enabled ? 'on' : 'off';

    await this.prisma.$transaction(
      valid.map((code) => {
        const key = FEATURE_KEY(code);
        return this.prisma.systemSetting.upsert({
          where: { key_organizationId: { key, organizationId: org } },
          create: { key, value: to, organizationId: org, updatedById: actorId },
          update: { value: to, updatedById: actorId },
        });
      }),
    );

    this.audit.record({
      userId: actorId,
      action: 'UPDATE',
      module: 'SYSTEM_SETTINGS',
      entity: 'SystemSetting',
      message: `${valid.length} feature(s) ${enabled ? 'enabled' : 'disabled'} for this company`,
      metadata: { codes: valid, to },
    });

    return this.getState(org);
  }

  /** Resolve the display label for a static or department feature code. */
  private async featureLabel(code: string): Promise<string | undefined> {
    const staticFeature = FEATURES.find((f) => f.code === code);
    if (staticFeature) return staticFeature.label;

    if (isDepartmentFeatureCode(code)) {
      const deptId = code.slice(DEPARTMENT_FEATURE_PREFIX.length);
      const dept = await this.prisma.department.findUnique({ where: { id: deptId } });
      if (dept) return `${dept.name} — Department`;
    }
    return undefined;
  }
}
