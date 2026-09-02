import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NumberingService } from './numbering.service';

function buildService() {
  const prisma = {
    systemSetting: {
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
  };
  const svc = new NumberingService(prisma as never);
  return { svc, prisma };
}

describe('NumberingService.next', () => {
  it('generates the first number when no existing setting', async () => {
    const { svc, prisma } = buildService();
    prisma.systemSetting.findMany.mockResolvedValue([]);
    prisma.systemSetting.upsert.mockResolvedValue({});

    const number = await svc.next('voucher_journal', 'JV');
    expect(number).toBe('JV-000001');
    expect(prisma.systemSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ key: 'numbering.voucher_journal', value: '1' }),
      }),
    );
  });

  it('increments from the existing counter', async () => {
    const { svc, prisma } = buildService();
    prisma.systemSetting.findMany.mockResolvedValue([{ key: 'numbering.sales', value: '42' }]);
    prisma.systemSetting.upsert.mockResolvedValue({});

    const number = await svc.next('sales', 'SI');
    expect(number).toBe('SI-000043');
  });

  it('pads to a custom length', async () => {
    const { svc, prisma } = buildService();
    prisma.systemSetting.findMany.mockResolvedValue([{ key: 'numbering.test', value: '99' }]);
    prisma.systemSetting.upsert.mockResolvedValue({});

    const number = await svc.next('test', 'T', undefined, 4);
    expect(number).toBe('T-0100');
  });

  it('uses the provided transaction client', async () => {
    const { svc } = buildService();
    const tx = {
      systemSetting: {
        findMany: vi.fn().mockResolvedValue([{ value: '5' }]),
        upsert: vi.fn().mockResolvedValue({}),
      },
    };

    const number = await svc.next('test', 'X', tx);
    expect(number).toBe('X-000006');
    expect(tx.systemSetting.findMany).toHaveBeenCalled();
  });
});
