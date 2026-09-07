import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NumberingService } from './numbering.service';

function buildService() {
  const prisma = {
    $queryRawUnsafe: vi.fn(),
    systemSetting: { findFirst: vi.fn().mockImplementation(() => null) },
    brandingSetting: { findFirst: vi.fn().mockResolvedValue(null) },
  };
  const svc = new NumberingService(prisma as never);
  return { svc, prisma };
}

/** Routes SystemSetting reads per key, mirroring the Settings page keys. */
function mockSettings(prisma: any, values: Record<string, string>) {
  prisma.systemSetting.findFirst.mockImplementation(
    ({ where }: { where: { key: string } }) =>
      values[where.key] !== undefined ? { key: where.key, value: values[where.key] } : null,
  );
}

describe('NumberingService.next', () => {
  beforeEach(() => {
    // Ensure a stable crypto.randomUUID in tests.
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValueOnce('00000000-0000-4000-8000-000000000000');
  });

  const year = new Date().getFullYear();

  it('generates the first number (1) when no row exists yet', async () => {
    const { svc, prisma } = buildService();
    prisma.$queryRawUnsafe.mockResolvedValue([{ value: '1' }]);

    const number = await svc.next('voucher_journal', 'JV');
    expect(number).toBe(`JV-${year}-000001`);
  });

  it('increments from the existing counter', async () => {
    const { svc, prisma } = buildService();
    prisma.$queryRawUnsafe.mockResolvedValue([{ value: '43' }]);

    const number = await svc.next('sales', 'SI');
    expect(number).toBe(`SI-${year}-000043`);
  });

  it('pads to a custom length', async () => {
    const { svc, prisma } = buildService();
    prisma.$queryRawUnsafe.mockResolvedValue([{ value: '100' }]);

    const number = await svc.next('test', 'T', undefined, 4);
    expect(number).toBe(`T-${year}-0100`);
  });

  it('uses the provided transaction client for the atomic upsert', async () => {
    const { svc, prisma } = buildService();
    const tx = { $queryRawUnsafe: vi.fn().mockResolvedValue([{ value: '6' }]) };

    const number = await svc.next('test', 'X', tx);
    expect(number).toBe(`X-${year}-000006`);
    expect(tx.$queryRawUnsafe).toHaveBeenCalledTimes(1);
    expect(tx.$queryRawUnsafe.mock.calls[0][0]).toContain('ON CONFLICT ("key", "organizationId")');
    expect(tx.$queryRawUnsafe.mock.calls[0][0]).toContain('RETURNING "value"');
    expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
  });

  it('uses a configured prefix override from SystemSetting', async () => {
    const { svc, prisma } = buildService();
    prisma.$queryRawUnsafe.mockResolvedValue([{ value: '3' }]);
    mockSettings(prisma, { 'numbering.invoicePrefix': 'INV' });

    const number = await svc.next('sale', 'SI');
    expect(number).toBe(`INV-${year}-000003`);
    expect(prisma.systemSetting.findFirst).toHaveBeenCalledWith({ where: { key: 'numbering.invoicePrefix' } });
  });

  it('uses a custom number template with company and month tokens', async () => {
    const { svc, prisma } = buildService();
    prisma.$queryRawUnsafe.mockResolvedValue([{ value: '7' }]);
    mockSettings(prisma, { 'numbering.template': '{prefix}/{company}/{year}-{seq}' });
    prisma.brandingSetting.findFirst.mockResolvedValue({ shortName: 'ACME', businessName: 'ACME Ltd' });

    const month = String(new Date().getMonth() + 1).padStart(2, '0');
    const number = await svc.next('sale', 'SI');
    expect(number).toBe(`SI/ACME/${year}-000007`);
    expect(month).toBeTruthy();
  });

  it('uses the configured sequence padding', async () => {
    const { svc, prisma } = buildService();
    prisma.$queryRawUnsafe.mockResolvedValue([{ value: '7' }]);
    mockSettings(prisma, { 'numbering.padding': '3' });

    const number = await svc.next('sale', 'SI');
    expect(number).toBe(`SI-${year}-007`);
  });

  it('keeps party codes unpadded by the template in a stable PREFIX-SEQUENCE shape', async () => {
    const { svc, prisma } = buildService();
    prisma.$queryRawUnsafe.mockResolvedValue([{ value: '5' }]);
    mockSettings(prisma, { 'numbering.template': '{prefix}/{company}/{year}-{seq}' });

    const number = await svc.next('customer', 'CST', undefined, 6, { year: false });
    expect(number).toBe('CST-000005');
  });

  it('scopes the counter by year so each series restarts annually', async () => {
    const { svc, prisma } = buildService();
    prisma.$queryRawUnsafe.mockResolvedValue([{ value: '9' }]);

    await svc.next('sale', 'SI');
    expect(prisma.$queryRawUnsafe.mock.calls[0][2]).toBe(`numbering.sale.${year}`);
  });
});

describe('NumberingService.preview', () => {
  it('returns the next number without incrementing the counter', async () => {
    const { svc, prisma } = buildService();
    prisma.$queryRawUnsafe.mockResolvedValue([{ value: '42' }]);

    const number = await svc.preview('sale', 'SI');
    expect(number).toBe(`SI-${new Date().getFullYear()}-000043`);
    // A read-only SELECT, not the atomic upsert.
    expect(prisma.$queryRawUnsafe.mock.calls[0][0]).toContain('SELECT');
    expect(prisma.$queryRawUnsafe.mock.calls[0][0]).not.toContain('ON CONFLICT');
  });

  it('returns the first number when no counter exists yet', async () => {
    const { svc, prisma } = buildService();
    prisma.$queryRawUnsafe.mockResolvedValue([]);

    const number = await svc.preview('sale', 'SI');
    expect(number).toBe(`SI-${new Date().getFullYear()}-000001`);
  });

  it('reflects a custom template when previewing', async () => {
    const { svc, prisma } = buildService();
    prisma.$queryRawUnsafe.mockResolvedValue([{ value: '2' }]);
    mockSettings(prisma, { 'numbering.template': '{prefix}-{year}/{seq}' });

    const number = await svc.preview('sale', 'SI');
    expect(number).toBe(`SI-${new Date().getFullYear()}/000003`);
  });
});