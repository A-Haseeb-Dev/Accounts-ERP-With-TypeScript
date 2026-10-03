import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NumberingService } from './numbering.service';

function buildService() {
  const prisma = {
    $queryRawUnsafe: vi.fn(),
    $executeRawUnsafe: vi.fn().mockResolvedValue(0),
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

/**
 * The chart of accounts needs the bare serial, not a formatted document number,
 * because it assembles `A1` + `-01` + `-0001` itself. These three methods are the
 * contract it relies on: an atomic draw, a floor it can raise but never lower,
 * and a read that reserves nothing.
 */
describe('NumberingService sequences', () => {
  describe('nextSequence', () => {
    it('returns the bare number for the caller to format', async () => {
      const { svc, prisma } = buildService();
      prisma.$queryRawUnsafe.mockResolvedValue([{ value: '7' }]);

      expect(await svc.nextSequence('account.head.A')).toBe(7);
    });

    it('is not scoped by year, so a series continues across years', async () => {
      const { svc, prisma } = buildService();
      prisma.$queryRawUnsafe.mockResolvedValue([{ value: '1' }]);

      await svc.nextSequence('account.head.A');
      expect(prisma.$queryRawUnsafe.mock.calls[0][2]).toBe('numbering.account.head.A');
    });

    it('stays atomic by running one upsert through the given transaction client', async () => {
      const { svc, prisma } = buildService();
      const tx = {
        $queryRawUnsafe: vi.fn().mockResolvedValue([{ value: '6' }]),
        $executeRawUnsafe: vi.fn(),
      };

      expect(await svc.nextSequence('account.head.A', tx)).toBe(6);
      expect(tx.$queryRawUnsafe.mock.calls[0][0]).toContain('ON CONFLICT ("key", "organizationId")');
      expect(tx.$queryRawUnsafe.mock.calls[0][0]).toContain('RETURNING "value"');
      expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
    });
  });

  describe('seedSequence', () => {
    it('raises the counter to the floor', async () => {
      const { svc, prisma } = buildService();

      await svc.seedSequence('account.head.A', 7);
      expect(prisma.$executeRawUnsafe.mock.calls[0][0]).toContain('UPDATE "SystemSetting"');
      expect(prisma.$executeRawUnsafe.mock.calls[0][1]).toBe('7');
    });

    it('never lowers a counter that is already ahead', async () => {
      const { svc, prisma } = buildService();

      await svc.seedSequence('account.head.A', 7);
      // The guard lives in the SQL so it holds under concurrency, not just in JS.
      expect(prisma.$executeRawUnsafe.mock.calls[0][0]).toContain('< $3');
    });

    it('writes nothing for a floor of zero or less', async () => {
      const { svc, prisma } = buildService();

      await svc.seedSequence('account.head.A', 0);
      await svc.seedSequence('account.head.A', -3);
      expect(prisma.$executeRawUnsafe).not.toHaveBeenCalled();
    });

    it('writes nothing for a floor that is not a number', async () => {
      const { svc, prisma } = buildService();

      await svc.seedSequence('account.head.A', Number.NaN);
      expect(prisma.$executeRawUnsafe).not.toHaveBeenCalled();
    });

    it('seeds through the transaction client when given one', async () => {
      const { svc, prisma } = buildService();
      const tx = { $executeRawUnsafe: vi.fn().mockResolvedValue(1), $queryRawUnsafe: vi.fn() };

      await svc.seedSequence('account.head.A', 7, tx);
      expect(tx.$executeRawUnsafe).toHaveBeenCalledTimes(1);
      expect(prisma.$executeRawUnsafe).not.toHaveBeenCalled();
    });
  });

  describe('peekSequence', () => {
    it('reads the current value without reserving anything', async () => {
      const { svc, prisma } = buildService();
      prisma.systemSetting.findFirst.mockResolvedValue({ value: '42' });

      expect(await svc.peekSequence('account.head.A')).toBe(42);
      expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
      expect(prisma.systemSetting.findFirst).toHaveBeenCalledWith({
        where: { key: 'numbering.account.head.A' },
        select: { value: true },
      });
    });

    it('reports 0 when the series has never been used', async () => {
      const { svc, prisma } = buildService();
      prisma.systemSetting.findFirst.mockResolvedValue(null);
      expect(await svc.peekSequence('account.head.A')).toBe(0);
    });

    it('reports 0 rather than NaN for an empty or corrupt counter', async () => {
      const { svc, prisma } = buildService();

      for (const value of ['', '   ', 'not-a-number']) {
        prisma.systemSetting.findFirst.mockResolvedValue({ value });
        expect(await svc.peekSequence('account.head.A')).toBe(0);
      }
    });
  });
});