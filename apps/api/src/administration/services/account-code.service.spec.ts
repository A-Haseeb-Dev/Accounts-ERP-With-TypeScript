import { describe, it, expect, vi } from 'vitest';
import { AccountCodeService } from './account-code.service';
import type { NumberingService } from '../../common/services/numbering.service';

/** `ApiException` carries its message inside the response body, not on `.message`. */
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
 * Codes are the identity of a ledger row, so allocation has two jobs: never hand
 * the same number to two people saving at once, and never collide with rows that
 * already exist (a chart built before the counters, or hand-edited back when
 * codes were user-typed).
 */
describe('AccountCodeService', () => {
  let prisma: Record<string, any>;
  let numbering: Record<string, any>;
  let svc: AccountCodeService;

  /**
   * A stand-in for `NumberingService`: one counter per series, as the real
   * service has (each series is its own `SystemSetting` row).
   */
  const counter = (start = 0) => {
    const values = new Map<string, number>();
    const seed = vi.fn(async (_key: string, _floor: number, _tx?: unknown) => undefined);
    const seq = {
      nextSequence: vi.fn(async (key: string) => {
        const n = (values.get(key) ?? start) + 1;
        values.set(key, n);
        return n;
      }),
      peekSequence: vi.fn(async (key: string) => values.get(key) ?? start),
      seedSequence: seed,
      /** Makes `seedSequence` actually move the counter, as the real one does. */
      raiseSeed: () =>
        seed.mockImplementation(async (key: string, f: number) => {
          if (f > (values.get(key) ?? start)) values.set(key, f);
        }),
      /** Deliberately inert seeding, to exercise the clamp and guard alone. */
      ignoreSeed: () => seed.mockImplementation(async (_key: string, _floor: number) => undefined),
    };
    return seq;
  };

  const build = (options: { codes?: Record<string, string[]>; counter?: ReturnType<typeof counter> } = {}) => {
    const existing = options.codes ?? {};
    const seq = options.counter ?? counter();
    /** Honours `startsWith`, so a series only ever sees its own prefix. */
    const rows = (kind: string) => ({
      findMany: vi.fn(async ({ where }: any) =>
        (existing[kind] ?? [])
          .filter((code) => code.startsWith(where.code.startsWith))
          .map((code) => ({ code })),
      ),
    });
    const unique = (kind: string) => ({
      findFirst: vi.fn(async ({ where }: any) =>
        (existing[kind] ?? []).includes(where.code) ? { id: 'taken' } : null,
      ),
      findUnique: vi.fn(async ({ where }: any) =>
        (existing[kind] ?? []).includes(where.code) ? { id: 'taken' } : null,
      ),
    });
    prisma = {
      headAccount: { ...rows('head'), ...unique('head') },
      subHead: { ...rows('subHead'), ...unique('subHead') },
      mainAccount: { ...rows('mainAccount'), ...unique('mainAccount') },
    };
    numbering = seq;
    svc = new AccountCodeService(prisma as never, numbering as unknown as NumberingService);
    return seq;
  };

  describe('head accounts', () => {
    it('starts each type at 1', async () => {
      build();
      expect(await svc.nextHeadCode('ASSET')).toBe('A1');
    });

    it('continues the series after the last one issued', async () => {
      build({ codes: { head: ['A1', 'A2', 'A3'] } });
      expect(await svc.nextHeadCode('ASSET')).toBe('A4');
    });

    it('keeps each letter in its own series', async () => {
      build({ codes: { head: ['A1', 'A2', 'L1', 'P1'] } });
      expect(await svc.nextHeadCode('LIABILITY')).toBe('L2');
      expect(await svc.nextHeadCode('EQUITY')).toBe('P2');
    });

    it('starts a fresh letter at 1 even when another letter is far ahead', async () => {
      build({ codes: { head: ['A1', 'A2', 'A3', 'A4', 'A5'] } });
      expect(await svc.nextHeadCode('EXPENSE')).toBe('E1');
    });

    it('does not reuse a number after one is deleted', async () => {
      // A1-3 is gone but the series remembers 3, so nothing reissues A3.
      build({ codes: { head: ['A1', 'A2', 'A4'] } });
      expect(await svc.nextHeadCode('ASSET')).toBe('A5');
    });

    it('counts a two-digit head correctly', async () => {
      build({ codes: { head: ['A1', 'A9', 'A10'] } });
      expect(await svc.nextHeadCode('ASSET')).toBe('A11');
    });
  });

  describe('sub heads', () => {
    it('extends the head code with a 2-digit serial', async () => {
      build();
      expect(await svc.nextSubHeadCode('A1')).toBe('A1-01');
    });

    it('pads to two digits and continues the series', async () => {
      build({ codes: { subHead: ['A1-01', 'A1-09'] } });
      expect(await svc.nextSubHeadCode('A1')).toBe('A1-10');
    });

    it('starts at 01 for each head independently', async () => {
      build({ codes: { subHead: ['A1-01', 'A1-02', 'A1-03'] } });
      expect(await svc.nextSubHeadCode('A2')).toBe('A2-01');
    });

    it('is not confused by a sibling head with a longer code', async () => {
      // A1's series must not pick up A10's sub heads.
      build({ codes: { subHead: ['A1-01', 'A10-01', 'A10-02'] } });
      expect(await svc.nextSubHeadCode('A1')).toBe('A1-02');
    });
  });

  describe('main accounts', () => {
    it('extends the sub head code with a 4-digit serial', async () => {
      build();
      expect(await svc.nextMainAccountCode('A1-01')).toBe('A1-01-0001');
    });

    it('pads to four digits and continues', async () => {
      build({ codes: { mainAccount: ['A1-01-0001', 'A1-01-0099'] } });
      expect(await svc.nextMainAccountCode('A1-01')).toBe('A1-01-0100');
    });

    it('starts at 0001 for each sub head independently', async () => {
      build({ codes: { mainAccount: ['A1-01-0001', 'A1-01-0002', 'A1-02-0007'] } });
      expect(await svc.nextMainAccountCode('A1-03')).toBe('A1-03-0001');
    });
  });

  describe('reconciling with a chart built before the counters existed', () => {
    it('seeds the counter past the highest code already stored', async () => {
      const seq = build({ codes: { head: ['A1', 'A2', 'A7'] } });
      seq.raiseSeed();

      expect(await svc.nextHeadCode('ASSET')).toBe('A8');
      expect(seq.seedSequence).toHaveBeenCalledWith('account.head.A', 7, undefined);
    });

    it('jumps past the gap left by a deleted number instead of refilling it', async () => {
      // A3 is gone but old vouchers may still quote it, so the counter is
      // lost and the chart is sparse — A3 must never come back around.
      const seq = build({ codes: { head: ['A1', 'A2', 'A4'] }, counter: counter(0) });
      seq.ignoreSeed();

      expect(await svc.nextHeadCode('ASSET')).toBe('A5');
      expect(seq.nextSequence).toHaveBeenCalledTimes(1);
    });

    it('does not skip numbers that were never issued', async () => {
      // A1 and A2 only: 3 is genuinely free, so the series continues at A3
      // rather than jumping past it.
      const seq = build({ codes: { head: ['A1', 'A2'] }, counter: counter(0) });
      seq.ignoreSeed();

      expect(await svc.nextHeadCode('ASSET')).toBe('A3');
    });

    it('counts codes, not just the highest, when the tail was deleted', async () => {
      // A1..A5 minus A5: four codes, highest 4, so the count pins the floor to 4
      // and A5 — which may be on old vouchers — is not reissued.
      const seq = build({ codes: { head: ['A1', 'A2', 'A3', 'A4'] }, counter: counter(0) });
      seq.ignoreSeed();

      expect(await svc.nextHeadCode('ASSET')).toBe('A5');
      expect(seq.seedSequence).toHaveBeenCalledWith('account.head.A', 4, undefined);
    });

    it('never lowers a counter that is already ahead of the rows', async () => {
      const seq = build({ codes: { head: ['A1', 'A2'] }, counter: counter(40) });

      expect(await svc.nextHeadCode('ASSET')).toBe('A41');
      // Floor is 2, but the counter is at 40 — seeding must not rewind it.
      expect(seq.seedSequence).toHaveBeenCalledWith('account.head.A', 2, undefined);
    });

    it('seeds per head for sub heads, not globally', async () => {
      const seq = build({ codes: { subHead: ['A1-01', 'A1-02', 'A2-01', 'A2-02', 'A2-03'] } });
      seq.raiseSeed();

      expect(await svc.nextSubHeadCode('A1')).toBe('A1-03');
      expect(seq.seedSequence).toHaveBeenCalledWith('account.subhead.A1', 2, undefined);
    });

    it('seeds per sub head for accounts, not globally', async () => {
      const seq = build({ codes: { mainAccount: ['A1-01-0001', 'A1-01-0002', 'A1-02-0009'] } });
      seq.raiseSeed();

      expect(await svc.nextMainAccountCode('A1-01')).toBe('A1-01-0003');
      expect(seq.seedSequence).toHaveBeenCalledWith('account.main.A1-01', 2, undefined);
    });
  });

  describe('the occupied-code backstop', () => {
    it('gives up with a retryable error rather than returning a duplicate', async () => {
      // Every code the guard checks is taken: a backstop, so it is simulated by
      // marking them all occupied rather than by constructing 64 rows.
      const seq = build({ codes: { head: ['A1'] }, counter: counter(0) });
      seq.ignoreSeed();
      prisma.headAccount.findUnique.mockResolvedValue({ id: 'taken' });

      const err = await apiError(svc.nextHeadCode('ASSET'));
      expect(err.status).toBe(422);
      expect(err.message).toMatch(/try again/i);
      // Bounded, so a stuck chart cannot spin forever.
      expect(seq.nextSequence).toHaveBeenCalledTimes(64);
    });
  });

  describe('previews', () => {
    it('does not reserve anything', async () => {
      const seq = build();
      await svc.previewHeadCode('ASSET');
      expect(seq.nextSequence).not.toHaveBeenCalled();
      expect(seq.seedSequence).not.toHaveBeenCalled();
    });

    it('shows the code the next create would get', async () => {
      build({ codes: { head: ['A1', 'A2'] } });
      expect(await svc.previewHeadCode('ASSET')).toBe('A3');
    });

    it('accounts for codes that exist but were never counted', async () => {
      build({ codes: { subHead: ['A1-01', 'A1-05'] }, counter: counter(0) });
      expect(await svc.previewSubHeadCode('A1')).toBe('A1-06');
    });

    it('previews a main account code from the sub head', async () => {
      build({ codes: { mainAccount: ['A1-01-0001'] } });
      expect(await svc.previewMainAccountCode('A1-01')).toBe('A1-01-0002');
    });
  });

  it('maps a head code back to its account type', () => {
    build();
    expect(svc.accountTypeForHeadCode('A1')).toBe('ASSET');
    expect(svc.accountTypeForHeadCode('L2')).toBe('LIABILITY');
    expect(svc.accountTypeForHeadCode('P1')).toBe('EQUITY');
    expect(svc.accountTypeForHeadCode('R1')).toBe('REVENUE');
    expect(svc.accountTypeForHeadCode('E1')).toBe('EXPENSE');
  });
});
