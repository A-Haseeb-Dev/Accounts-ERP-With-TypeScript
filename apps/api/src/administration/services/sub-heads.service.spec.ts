import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SubHeadsService } from './sub-heads.service';
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
 * A sub head code is its parent head's code plus a serial (`A1-01`), and every
 * main account beneath it carries that code in its own. So a sub head that
 * moves to another head has to be renumbered, and its accounts with it.
 */
describe('SubHeadsService', () => {
  const headA = { id: 'h-1', code: 'A1' };
  const headL = { id: 'h-2', code: 'L2' };
  const sub = { id: 'sh-1', code: 'A1-01', name: 'Cash', headAccountId: 'h-1' };

  let nextSubHeadCode: ReturnType<typeof vi.fn>;
  let nextMainAccountCode: ReturnType<typeof vi.fn>;
  let prisma: Record<string, any>;
  let tx: Record<string, any>;
  let svc: SubHeadsService;

  beforeEach(() => {
    nextSubHeadCode = vi.fn().mockResolvedValue('A1-01');
    nextMainAccountCode = vi.fn().mockResolvedValue('A1-01-0001');
    tx = {
      subHead: {
        create: vi.fn().mockResolvedValue({ ...sub, headAccount: headA }),
        update: vi.fn().mockResolvedValue({ ...sub, headAccount: headA }),
      },
      mainAccount: {
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    prisma = {
      headAccount: { findUnique: vi.fn().mockResolvedValue(headA) },
      subHead: {
        findFirst: vi.fn().mockResolvedValue(null),
        findUnique: vi.fn().mockResolvedValue({ ...sub, headAccount: headA }),
        create: vi.fn(),
        update: vi.fn().mockResolvedValue({ ...sub, headAccount: headA }),
        delete: vi.fn().mockResolvedValue({}),
      },
      mainAccount: { findMany: vi.fn().mockResolvedValue([]), deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
      $transaction: vi.fn().mockImplementation((fn: (t: unknown) => unknown) => fn(tx)),
    };
    const codes = {
      nextSubHeadCode,
      nextMainAccountCode,
      previewSubHeadCode: vi.fn().mockResolvedValue('A1-02'),
      accountTypeForHeadCode: vi.fn((code: string) =>
        code.trim().charAt(0).toUpperCase() === 'A' ? 'ASSET' : 'LIABILITY',
      ),
    } as unknown as AccountCodeService;
    svc = new SubHeadsService(prisma as never, { record: vi.fn() } as never, codes);
  });

  describe('create', () => {
    it('extends the parent head code with a serial', async () => {
      await svc.create({ name: 'Cash', headAccountId: 'h-1' }, 'user-1');

      expect(nextSubHeadCode).toHaveBeenCalledWith('A1', expect.anything());
      expect(tx.subHead.create.mock.calls[0][0].data.code).toBe('A1-01');
    });

    it('never writes a client-supplied code', async () => {
      await svc.create({ name: 'Cash', headAccountId: 'h-1', code: 'HACKED' } as never, 'user-1');
      expect(tx.subHead.create.mock.calls[0][0].data.code).toBe('A1-01');
    });

    it('rejects a sub head under a head that does not exist', async () => {
      prisma.headAccount.findUnique.mockResolvedValue(null);
      const err = await apiError(svc.create({ name: 'Cash', headAccountId: 'ghost' }, 'user-1'));

      expect(err.status).toBe(404);
      expect(tx.subHead.create).not.toHaveBeenCalled();
    });

    it('rejects a duplicate name under the same head', async () => {
      prisma.subHead.findFirst.mockResolvedValue({ id: 'sh-9', code: 'A1-09', name: 'Cash' });
      const err = await apiError(svc.create({ name: 'Cash', headAccountId: 'h-1' }, 'user-1'));

      expect(err.status).toBe(409);
      expect(tx.subHead.create).not.toHaveBeenCalled();
    });
  });

  describe('moving to another head', () => {
    beforeEach(() => {
      prisma.headAccount.findUnique.mockResolvedValue(headL);
      nextSubHeadCode.mockResolvedValue('L2-01');
      nextMainAccountCode.mockResolvedValue('L2-01-0001');
    });

    it('renumbers the sub head under the new head', async () => {
      await svc.update('sh-1', { headAccountId: 'h-2' }, 'user-1');

      expect(prisma.$transaction).toHaveBeenCalled();
      const data = tx.subHead.update.mock.calls[0][0].data;
      expect(data.code).toBe('L2-01');
      expect(data.headAccountId).toBe('h-2');
    });

    it('renumbers every main account beneath it and retags their type', async () => {
      tx.mainAccount.findMany.mockResolvedValue([{ id: 'a1' }, { id: 'a2' }]);
      nextMainAccountCode
        .mockResolvedValueOnce('L2-01-0001')
        .mockResolvedValueOnce('L2-01-0002');

      await svc.update('sh-1', { headAccountId: 'h-2' }, 'user-1');

      expect(tx.mainAccount.update).toHaveBeenCalledTimes(2);
      expect(nextMainAccountCode).toHaveBeenCalledTimes(2);
      // A1's account type becomes LIABILITY: it now sits under an L head.
      for (const call of tx.mainAccount.update.mock.calls) {
        expect(call[0].data.accountType).toBe('LIABILITY');
      }
      expect(tx.mainAccount.update.mock.calls.map((c: any[]) => c[0].data.code)).toEqual([
        'L2-01-0001',
        'L2-01-0002',
      ]);
    });

    it('renumbers accounts oldest first so their relative order is kept', async () => {
      tx.mainAccount.findMany.mockResolvedValue([{ id: 'a1' }, { id: 'a2' }, { id: 'a3' }]);
      nextMainAccountCode
        .mockResolvedValueOnce('L2-01-0001')
        .mockResolvedValueOnce('L2-01-0002')
        .mockResolvedValueOnce('L2-01-0003');

      await svc.update('sh-1', { headAccountId: 'h-2' }, 'user-1');

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(tx.mainAccount.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { subHeadId: 'sh-1' }, orderBy: { code: 'asc' } }),
      );
      expect(tx.mainAccount.update.mock.calls.map((c: any[]) => [c[0].where.id, c[0].data.code])).toEqual([
        ['a1', 'L2-01-0001'],
        ['a2', 'L2-01-0002'],
        ['a3', 'L2-01-0003'],
      ]);
    });

    it('leaves the code alone when the head is unchanged', async () => {
      await svc.update('sh-1', { headAccountId: 'h-1' }, 'user-1');

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(nextSubHeadCode).not.toHaveBeenCalled();
      expect(tx.mainAccount.update).not.toHaveBeenCalled();
    });

    it('rejects a move to a head that does not exist', async () => {
      prisma.headAccount.findUnique.mockResolvedValue(null);
      const err = await apiError(svc.update('sh-1', { headAccountId: 'ghost' }, 'user-1'));

      expect(err.status).toBe(404);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });
});
