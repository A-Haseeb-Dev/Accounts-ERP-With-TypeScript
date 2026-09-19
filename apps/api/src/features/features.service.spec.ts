import { describe, it, expect, vi } from 'vitest';
import { FeaturesService } from './features.service';

function buildService(overrides: Record<string, unknown> = {}) {
  const prisma = {
    systemSetting: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockImplementation(({ create }) => Promise.resolve({ ...create, id: 's1' })),
    },
    department: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
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
    prisma.systemSetting.findMany.mockResolvedValue([
      { key: 'features.sales.invoice.view', value: 'off' },
    ]);

    const state = await svc.getState();
    expect(state.length).toBeGreaterThan(0);
    const salesInvoice = state.find((f) => f.code === 'sales.invoice.view');
    expect(salesInvoice?.enabled).toBe(false);
    expect(salesInvoice?.group).toBe('Sales');
    expect(salesInvoice?.action).toBe('View');
    const vouchers = state.find((f) => f.code === 'accounts.vouchers.view');
    expect(vouchers?.enabled).toBe(true);
  });

  it('appends each active department as a company feature under the Departments group', async () => {
    const { svc, prisma } = buildService();
    prisma.department.findMany.mockResolvedValue([
      { id: 'dept-1', name: 'Warehouse', status: 'active' },
    ]);
    prisma.systemSetting.findMany.mockResolvedValue([
      { key: 'features.hr.departments.dept-1', value: 'off' },
    ]);

    const state = await svc.getState();
    const dept = state.find((f) => f.code === 'hr.departments.dept-1');
    expect(dept).toMatchObject({
      group: 'Departments',
      resource: 'Warehouse',
      action: 'Department',
      enabled: false,
    });
  });
});

describe('FeaturesService.isEnabled', () => {
  it('returns true for unknown codes', async () => {
    const { svc } = buildService();
    await expect(svc.isEnabled('nonsense')).resolves.toBe(true);
  });

  it('defaults to enabled when no row exists', async () => {
    const { svc } = buildService();
    await expect(svc.isEnabled('sales.invoice.view')).resolves.toBe(true);
  });

  it('respects an explicit off row', async () => {
    const { svc, prisma } = buildService();
    prisma.systemSetting.findFirst.mockResolvedValue({
      key: 'features.sales.invoice.view',
      value: 'off',
    });
    await expect(svc.isEnabled('sales.invoice.view')).resolves.toBe(false);
  });

  it('answers for department feature codes using their toggle', async () => {
    const { svc, prisma } = buildService();
    prisma.systemSetting.findFirst.mockResolvedValue({
      key: 'features.hr.departments.dept-1',
      value: 'off',
    });
    await expect(svc.isEnabled('hr.departments.dept-1')).resolves.toBe(false);
    prisma.systemSetting.findFirst.mockResolvedValue(null);
    await expect(svc.isEnabled('hr.departments.dept-2')).resolves.toBe(true);
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
    await svc.setEnabled('sales.invoice.view', false, 'u1');

    expect(prisma.systemSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          key_organizationId: {
            key: 'features.sales.invoice.view',
            organizationId: 'default-org',
          },
        },
        create: expect.objectContaining({ key: 'features.sales.invoice.view', value: 'off' }),
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'UPDATE',
        module: 'SYSTEM_SETTINGS',
        message: 'Feature "Invoice — View" disabled for this company',
      }),
    );
  });

  it('supports turning a department feature off', async () => {
    const { svc, prisma, audit } = buildService();
    prisma.department.findUnique.mockResolvedValue({ id: 'dept-1', name: 'Warehouse' });

    await svc.setEnabled('hr.departments.dept-1', false, 'u1');

    expect(prisma.systemSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          key_organizationId: {
            key: 'features.hr.departments.dept-1',
            organizationId: 'default-org',
          },
        },
        create: expect.objectContaining({
          key: 'features.hr.departments.dept-1',
          value: 'off',
        }),
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Feature "Warehouse — Department" disabled for this company',
      }),
    );
  });
});
