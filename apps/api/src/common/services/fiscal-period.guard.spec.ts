import { describe, it, expect, vi } from 'vitest';
import { FiscalPeriodGuard } from './fiscal-period.guard';
import { ApiException } from '../exceptions/api.exception';

function build(settingValue?: string) {
  const prisma = {
    systemSetting: {
      findFirst: vi.fn().mockResolvedValue(settingValue ? { value: settingValue } : null),
    },
  } as never;
  const guard = new FiscalPeriodGuard(prisma);
  return { guard, prisma };
}

describe('FiscalPeriodGuard', () => {
  it('allows dates after the lock boundary', async () => {
    const { guard } = build('2026-08-31');
    // Rigorous: call assertOpen for a date strictly after the lock, expect no throw.
    await expect(guard.assertOpen(new Date('2026-09-01'), 'Create voucher')).resolves.toBeUndefined();
  });

  it('allows when no lock is configured', async () => {
    const { guard } = build(undefined);
    await expect(guard.assertOpen(new Date('2026-01-01'), 'Create voucher')).resolves.toBeUndefined();
  });

  it('rejects a date on the lock boundary (inclusive)', async () => {
    const { guard } = build('2026-08-31');
    await expect(guard.assertOpen('2026-08-31', 'Create voucher')).rejects.toBeInstanceOf(ApiException);
  });

  it('rejects a date strictly before the boundary', async () => {
    const { guard } = build('2026-08-31');
    await expect(guard.assertOpen('2026-08-01', 'Create voucher')).rejects.toBeInstanceOf(ApiException);
  });

  it('ignores an unparseable lock value', async () => {
    const { guard } = build('not-a-date');
    await expect(guard.assertOpen('2026-01-01', 'Create voucher')).resolves.toBeUndefined();
  });
});