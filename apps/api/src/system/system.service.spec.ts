import { describe, it, expect, vi } from 'vitest';
import { SystemService } from './system.service';

function buildService(overrides: Record<string, unknown> = {}) {
  const prisma = {
    systemSetting: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockImplementation(({ create }) => Promise.resolve({ ...create, id: 's1' })),
    },
    brandingSetting: {
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'b1', ...data })),
      create: vi.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'b1', ...data })),
    },
    ...overrides,
  };
  const audit = { record: vi.fn() };
  const svc = new SystemService(prisma as never, audit as never);
  return { svc, prisma, audit };
}

describe('SystemService.exportSettings', () => {
  it('returns versioned JSON with every setting and branding', async () => {
    const { svc, prisma } = buildService();
    prisma.systemSetting.findMany.mockResolvedValue([
      { key: 'currency', value: 'PKR' },
      { key: 'numbering.sale.2026', value: '42' },
    ]);
    prisma.brandingSetting.findFirst.mockResolvedValue({ shortName: 'ACME', businessName: 'ACME Ltd' });

    const result = await svc.exportSettings();
    expect(result.version).toBe(1);
    expect(result.settings).toEqual({ currency: 'PKR', 'numbering.sale.2026': '42' });
    expect(result.branding).toEqual({ shortName: 'ACME', businessName: 'ACME Ltd' });
    expect(result.exportedAt).toBeTruthy();
  });
});

describe('SystemService.importSettings', () => {
  it('upserts every setting key and creates a branding row', async () => {
    const { svc, prisma, audit } = buildService();
    prisma.brandingSetting.findFirst.mockResolvedValue(null);

    await svc.importSettings({
      version: 1,
      settings: { currency: 'USD', 'numbering.template': '{prefix}-{seq}' },
      branding: { shortName: 'ACME', primaryColor: '#123456' },
    });

    expect(prisma.systemSetting.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.brandingSetting.create).toHaveBeenCalledWith({
      data: { shortName: 'ACME', primaryColor: '#123456', organizationId: 'default-org' },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'RESTORE', module: 'SYSTEM_SETTINGS' }),
    );
  });

  it('updates an existing branding row instead of creating a duplicate', async () => {
    const { svc, prisma } = buildService();
    prisma.brandingSetting.findFirst.mockResolvedValue({ id: 'b1', shortName: 'OLD' });

    await svc.importSettings({ settings: { currency: 'PKR' }, branding: { shortName: 'NEW' } });

    expect(prisma.brandingSetting.update).toHaveBeenCalledWith({
      where: { id: 'b1' },
      data: { shortName: 'NEW' },
    });
    expect(prisma.brandingSetting.create).not.toHaveBeenCalled();
  });

  it('ignores unknown branding fields', async () => {
    const { svc, prisma } = buildService();
    prisma.brandingSetting.findFirst.mockResolvedValue(null);

    await svc.importSettings({ settings: {}, branding: { shortName: 'ACME', evil: 'x', id: 'nope' } });

    expect(prisma.brandingSetting.create.mock.calls[0][0].data).toEqual({
      shortName: 'ACME',
      organizationId: 'default-org',
    });
  });

  it('rejects a payload without a settings map', async () => {
    const { svc } = buildService();
    await expect(svc.importSettings(null as never)).rejects.toMatchObject({
      response: { error: { code: 'VALIDATION_ERROR' } },
    });
    await expect(svc.importSettings({} as never)).rejects.toMatchObject({
      response: { error: { code: 'VALIDATION_ERROR' } },
    });
  });
});