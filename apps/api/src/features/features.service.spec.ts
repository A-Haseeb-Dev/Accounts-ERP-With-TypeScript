import { describe, it, expect, vi } from 'vitest';
import { FeaturesService } from './features.service';

function buildService(overrides: Record<string, unknown> = {}) {
  const prisma = {
    systemSetting: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockImplementation(({ create }) => Promise.resolve({ ...create, id: 's1' })),
    },
    ...overrides,
  };
  const audit = { record: vi.fn() };
  const svc = new FeaturesService(prisma as never, audit as never);
  return { svc, prisma, audit };
}

describe('FeaturesService.getState', () => {
  it('lists every catalog feature as enabled by default', async () => {
    const { svc, prisma } = buildService();
    prisma.systemSetting.findMany.mockResolvedValue([{ key: 'features.sales', value: 'off' }]);

    const state = await svc.getState();
    expect(state.length).toBeGreaterThan(0);
    const sales = state.find((f) => f.code === 'sales');
    expect(sales?.enabled).toBe(false);
    const accounts = state.find((f) => f.code === 'accounts');
    expect(accounts?.enabled).toBe(true);
  });
});

describe('FeaturesService.isEnabled', () => {
  it('returns true for unknown codes', async () => {
    const { svc } = buildService();
    await expect(svc.isEnabled('nonsense')).resolves.toBe(true);
  });

  it('defaults to enabled when no row exists', async () => {
    const { svc } = buildService();
    await expect(svc.isEnabled('sales')).resolves.toBe(true);
  });

  it('respects an explicit off row', async () => {
    const { svc, prisma } = buildService();
    prisma.systemSetting.findFirst.mockResolvedValue({ key: 'features.sales', value: 'off' });
    await expect(svc.isEnabled('sales')).resolves.toBe(false);
  });
});

describe('FeaturesService.setEnabled', () => {
  it('rejects an unknown feature code', async () => {
    const { svc } = buildService();
    await expect(svc.setEnabled('nonsense', true, 'u1')).rejects.toMatchObject({
      response: { error: { code: 'NOT_FOUND' } },
    });
  });

  it('persists the switch and records an audit entry', async () => {
    const { svc, prisma, audit } = buildService();
    await svc.setEnabled('sales', false, 'u1');

    expect(prisma.systemSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key_organizationId: { key: 'features.sales', organizationId: 'default-org' } },
        create: expect.objectContaining({ key: 'features.sales', value: 'off' }),
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'UPDATE',
        module: 'SYSTEM_SETTINGS',
        message: 'Feature "Sales" disabled for this company',
      }),
    );
  });
});