import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HeadAccountsService } from './head-accounts.service';
import type { AccountCodeService } from './account-code.service';

async function apiError(p: Promise<unknown>): Promise<{ status: number; code: string; message: string }> {
  try {
    await p;
  } catch (err) {
    const e = err as { getResponse?: () => unknown; getStatus?: () => number; status?: number };
    const resp = (e.getResponse?.() ?? {}) as { error?: { message?: string; code?: string } };
    return {
      status: e.status ?? e.getStatus?.() ?? 0,
      code: resp.error?.code ?? '',
      message: resp.error?.message ?? '',
    };
  }
  throw new Error('Expected an ApiException but none was thrown');
}

/**
 * A head account's code fixes the type letter for everything filed under it, so
 * it is assigned by the server from the account type. Clients cannot type one.
 */
describe('HeadAccountsService', () => {
  const created = { id: 'h-1', code: 'A1', name: 'Current Assets' };

  let nextHeadCode: ReturnType<typeof vi.fn>;
  let prisma: Record<string, any>;
  let tx: Record<string, any>;
  let svc: HeadAccountsService;

  beforeEach(() => {
    nextHeadCode = vi.fn().mockResolvedValue('A1');
    tx = { headAccount: { create: vi.fn().mockResolvedValue({ ...created }), update: vi.fn().mockResolvedValue({ ...created }) } };
    prisma = {
      headAccount: {
        findFirst: vi.fn().mockResolvedValue(null),
        findUnique: vi.fn().mockResolvedValue({ ...created }),
        create: vi.fn(),
        update: vi.fn().mockResolvedValue({ ...created }),
      },
      $transaction: vi.fn().mockImplementation((fn: (t: unknown) => unknown) => fn(tx)),
    };
    const codes = {
      nextHeadCode,
      previewHeadCode: vi.fn().mockResolvedValue('A1'),
    } as unknown as AccountCodeService;
    svc = new HeadAccountsService(prisma as never, { record: vi.fn() } as never, codes);
  });

  it('assigns the code from the account type', async () => {
    await svc.create({ accountType: 'ASSET', name: 'Current Assets' }, 'user-1');

    expect(nextHeadCode).toHaveBeenCalledWith('ASSET', expect.anything());
    expect(tx.headAccount.create.mock.calls[0][0].data.code).toBe('A1');
  });

  it('assigns a different letter per type', async () => {
    nextHeadCode.mockResolvedValue('L1');
    await svc.create({ accountType: 'LIABILITY', name: 'Payables' }, 'user-1');

    expect(nextHeadCode).toHaveBeenCalledWith('LIABILITY', expect.anything());
    expect(tx.headAccount.create.mock.calls[0][0].data.code).toBe('L1');
  });

  it('never writes a code the client supplied', async () => {
    // The DTO has no `code`, and whitelist:true strips one, but the service must
    // not reach for dto.code even if a caller passes it.
    await svc.create({ accountType: 'ASSET', name: 'Current Assets', code: 'HACKED' } as never, 'user-1');

    expect(tx.headAccount.create.mock.calls[0][0].data.code).toBe('A1');
  });

  it('writes the code and the row in one transaction', async () => {
    await svc.create({ accountType: 'ASSET', name: 'Current Assets' }, 'user-1');
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('rejects a duplicate head name', async () => {
    prisma.headAccount.findFirst.mockResolvedValue({ id: 'h-9', code: 'A9', name: 'Current Assets' });
    const err = await apiError(svc.create({ accountType: 'ASSET', name: 'current assets' }, 'user-1'));

    expect(err.status).toBe(409);
    expect(tx.headAccount.create).not.toHaveBeenCalled();
  });

  it('ignores a code on update — the code is immutable', async () => {
    await svc.update('h-1', { code: 'ZZ9', name: 'Current Assets' } as never, 'user-1');

    // Not renumbered: renumbering a head would restate every account beneath it.
    const data = prisma.headAccount.update.mock.calls[0][0].data;
    expect(data.code).toBeUndefined();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('previews the next code for a type', async () => {
    const codes = { previewHeadCode: vi.fn().mockResolvedValue('A2') } as unknown as AccountCodeService;
    const previewSvc = new HeadAccountsService(prisma as never, { record: vi.fn() } as never, codes);
    expect(await previewSvc.previewCode('ASSET')).toBe('A2');
  });
});
