import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NumberingService } from './numbering.service';

function buildService() {
  const prisma = {
    $queryRawUnsafe: vi.fn(),
  };
  const svc = new NumberingService(prisma as never);
  return { svc, prisma };
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
});