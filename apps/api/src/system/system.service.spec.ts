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

describe('SystemService print layout', () => {
  it('reads only the print.* keys', async () => {
    const { svc, prisma } = buildService();
    prisma.systemSetting.findMany.mockResolvedValue([
      { key: 'print.paperSize', value: 'A4' },
      { key: 'print.layout', value: '{}' },
    ]);

    const result = await svc.getPrintLayout();

    expect(prisma.systemSetting.findMany).toHaveBeenCalledWith({
      where: { key: { startsWith: 'print.' } },
    });
    expect(result).toEqual({ 'print.paperSize': 'A4', 'print.layout': '{}' });
  });

  it('maps layout fields onto their print.* keys', async () => {
    const { svc, prisma } = buildService();

    await svc.updatePrintLayout({ paperSize: 'A5', printScale: '80', invoiceTemplate: 'compact' }, 'u1');

    const written = prisma.systemSetting.upsert.mock.calls.map((c) => c[0].create.key);
    expect(written).toEqual(
      expect.arrayContaining(['print.paperSize', 'print.scale', 'print.invoiceTemplate']),
    );
    expect(prisma.systemSetting.upsert.mock.calls[0][0].create.value).toBe('A5');
  });

  it('accepts print.* keys from the free-form map and ignores everything else', async () => {
    const { svc, prisma } = buildService();

    await svc.updatePrintLayout({
      values: {
        'print.layout': '{"blocks":[]}',
        'print.layoutOverrides': '{}',
        'print.layouts': '{}',
        currency: 'USD',
        'accounting.cash_account': 'acc-1',
      },
    });

    const written = prisma.systemSetting.upsert.mock.calls.map((c) => c[0].create.key);
    expect(written).toEqual(['print.layout', 'print.layoutOverrides', 'print.layouts']);
  });

  it('rejects a payload that touches no print layout key', async () => {
    const { svc } = buildService();
    await expect(svc.updatePrintLayout({ values: { currency: 'USD' } })).rejects.toMatchObject({
      response: { error: { code: 'VALIDATION_ERROR' } },
    });
    await expect(svc.updatePrintLayout({})).rejects.toMatchObject({
      response: { error: { code: 'VALIDATION_ERROR' } },
    });
  });

  it('records the change under its own audit module', async () => {
    const { svc, audit } = buildService();
    await svc.updatePrintLayout({ paperSize: 'A4' }, 'u1');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'UPDATE', module: 'SYSTEM_PRINT_LAYOUT' }),
    );
  });
});

describe('SystemService account role validation', () => {
  function withAccounts(accounts: { id: string; code: string; name: string; accountType: string }[]) {
    return buildService({ mainAccount: { findMany: vi.fn().mockResolvedValue(accounts) } });
  }

  it('rejects a cost-of-sales mapping that points at a revenue account', async () => {
    const { svc } = withAccounts([
      { id: 'sales', code: 'R1', name: 'Sales', accountType: 'REVENUE' },
    ]);

    await expect(
      svc.updateSettings({ values: { 'accounting.cost_of_sales_account': 'sales' } }),
    ).rejects.toMatchObject({
      response: {
        error: {
          code: 'VALIDATION_ERROR',
          message: expect.stringContaining('must point at an account of type EXPENSE'),
        },
      },
    });
  });

  it('accepts a mapping to an account of the right type', async () => {
    const { svc, prisma } = withAccounts([
      { id: 'cogs', code: 'E1', name: 'Cost of Sales', accountType: 'EXPENSE' },
    ]);

    await svc.updateSettings({ values: { 'accounting.cost_of_sales_account': 'cogs' } });

    const written = prisma.systemSetting.upsert.mock.calls.map((c) => c[0].create.key);
    expect(written).toContain('accounting.cost_of_sales_account');
  });

  it('rejects a payable mapping that points at an asset account', async () => {
    const { svc } = withAccounts([
      { id: 'cash', code: 'A1', name: 'Cash', accountType: 'ASSET' },
    ]);

    await expect(
      svc.updateSettings({ values: { 'accounting.payable_account': 'cash' } }),
    ).rejects.toMatchObject({
      response: {
        error: { message: expect.stringContaining('Accounts Payable') },
      },
    });
  });

  it('still rejects a mapping that points at no account at all', async () => {
    const { svc } = withAccounts([]);

    await expect(
      svc.updateSettings({ values: { 'accounting.cash_account': 'ghost' } }),
    ).rejects.toMatchObject({
      response: { error: { message: expect.stringContaining('must point at an existing account') } },
    });
  });
});

describe('SystemService settings still write print layout keys', () => {
  it('keeps the shared settings screen able to set print options', async () => {
    const { svc, prisma } = buildService();

    await svc.updateSettings({ currency: 'PKR', paperSize: 'Letter', reportShowBranding: 'true' });

    const written = prisma.systemSetting.upsert.mock.calls.map((c) => c[0].create.key);
    expect(written).toEqual(
      expect.arrayContaining(['currency', 'print.paperSize', 'print.reportShowBranding']),
    );
  });
});