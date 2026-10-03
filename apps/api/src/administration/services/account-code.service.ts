import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NumberingService } from '../../common/services/numbering.service';
import { ApiException } from '../../common/exceptions/api.exception';
import {
  type AccountType,
  formatHeadCode,
  formatMainAccountCode,
  formatSubHeadCode,
  letterForType,
  typeForLetter,
  HEAD_SERIAL,
  MAIN_ACCOUNT_SERIAL,
  SUB_HEAD_SERIAL,
  highestSerial,
} from '../utils/account-code';

/** Guard against a runaway retry loop; only ever hit by a real collision storm. */
const MAX_ATTEMPTS = 64;

/**
 * Allocates chart of accounts codes.
 *
 * A code is a ledger row's identity: it is printed on vouchers, grouped in
 * reports, and how an accountant refers to an account. So codes are assigned
 * here and nowhere else — the API never accepts one from a client, which is
 * what stops a hand-typed code from contradicting the hierarchy it sits in (an
 * `R` account filed under an `A` head, say).
 *
 * Each series is a monotonic counter in `SystemSetting` advanced by an atomic
 * upsert, so two people saving at the same moment cannot be handed the same
 * number. Numbers are never reused: deleting `A1-03` leaves the series at 3, so
 * the next sub head is `A1-04` rather than handing out a code that may still
 * appear on old vouchers.
 *
 * The counter only knows what this service issued. A chart that predates it, or
 * one that was hand-edited before codes became server-owned, is reconciled on
 * every allocation by raising the counter past everything already in use —
 * counting codes as well as measuring the highest, so a deleted number's gap is
 * skipped rather than refilled.
 */
@Injectable()
export class AccountCodeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: NumberingService,
  ) {}

  async nextHeadCode(accountType: AccountType, tx?: any): Promise<string> {
    const letter = letterForType(accountType);
    const series = `account.head.${letter}`;
    return this.allocate(series, (n) => formatHeadCode(letter, n), tx, async (code) =>
      !!(await this.prisma.headAccount.findUnique({ where: { code }, select: { id: true } })),
    );
  }

  async nextSubHeadCode(headCode: string, tx?: any): Promise<string> {
    const base = headCode.trim();
    const series = `account.subhead.${base}`;
    return this.allocate(series, (n) => formatSubHeadCode(base, n), tx, async (code) =>
      !!(await this.prisma.subHead.findFirst({ where: { code }, select: { id: true } })),
    );
  }

  async nextMainAccountCode(subHeadCode: string, tx?: any): Promise<string> {
    const base = subHeadCode.trim();
    const series = `account.main.${base}`;
    return this.allocate(series, (n) => formatMainAccountCode(base, n), tx, async (code) =>
      !!(await this.prisma.mainAccount.findFirst({ where: { code }, select: { id: true } })),
    );
  }

  /**
   * The code the next create would be given, for showing in a form. Read-only:
   * it reserves nothing, so the real allocation still happens on save.
   */
  async previewHeadCode(accountType: AccountType): Promise<string> {
    const letter = letterForType(accountType);
    return this.preview(`account.head.${letter}`, (n) => formatHeadCode(letter, n), async (code) =>
      !!(await this.prisma.headAccount.findUnique({ where: { code }, select: { id: true } })),
    );
  }

  async previewSubHeadCode(headCode: string): Promise<string> {
    const base = headCode.trim();
    return this.preview(`account.subhead.${base}`, (n) => formatSubHeadCode(base, n), async (code) =>
      !!(await this.prisma.subHead.findFirst({ where: { code }, select: { id: true } })),
    );
  }

  async previewMainAccountCode(subHeadCode: string): Promise<string> {
    const base = subHeadCode.trim();
    return this.preview(`account.main.${base}`, (n) => formatMainAccountCode(base, n), async (code) =>
      !!(await this.prisma.mainAccount.findFirst({ where: { code }, select: { id: true } })),
    );
  }

  /** The account type a head's code letter implies. */
  accountTypeForHeadCode(code: string): AccountType {
    return typeForLetter(code);
  }

  /**
   * Reserves serials until one yields a code that is not already taken.
   *
   * `floor` is the point past which nothing may be reused, and the counter is
   * seeded to it before the first number is drawn. The draw is clamped to
   * `floor + 1` as well, so a counter that somehow lagged behind cannot hand out
   * a number the chart already uses.
   *
   * The `taken` probe is a backstop, not the main defence: because the floor
   * covers every code in the series, a correctly seeded counter cannot land on an
   * occupied number. It stays as a bounded guard so a constraint violation is
   * reported as "try again" instead of an unhandled database error.
   */
  private async allocate(
    series: string,
    format: (serial: number) => string,
    tx: any,
    taken: (code: string) => Promise<boolean>,
  ): Promise<string> {
    const floor = await this.floorInUse(series);
    await this.numbering.seedSequence(series, floor, tx);

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const drawn = await this.numbering.nextSequence(series, tx);
      const code = format(Math.max(drawn, floor + 1));
      if (!(await taken(code))) return code;
    }

    throw ApiException.invalidTransaction(
      'Could not allocate a unique account code. Please try again.',
    );
  }

  /** Preview counterpart of `allocate` — peeks and probes, reserving nothing. */
  private async preview(
    series: string,
    format: (serial: number) => string,
    taken: (code: string) => Promise<boolean>,
  ): Promise<string> {
    const floor = await this.floorInUse(series);
    let serial = Math.max((await this.numbering.peekSequence(series)) + 1, floor + 1);
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const code = format(serial);
      if (!(await taken(code))) return code;
      serial++;
    }
    throw ApiException.invalidTransaction(
      'Could not determine the next account code. Please try again.',
    );
  }

  /**
   * The series key carries the code it is counting within (a head code for sub
   * heads, a sub head code for accounts), so the same key maps to the same
   * prefix pattern.
   *
   * Returns the highest number that must never be issued again, which is the
   * larger of the highest serial in the series and how many codes it holds.
   *
   * Counting as well as measuring is what stops a gap being refilled. A chart
   * holding `A1, A2, A4` has three codes and a highest of 4, so the next number
   * is 5: `A1-03` stays unused even though the counter was lost, because old
   * vouchers may still quote it. Without the count, the collision guard would
   * walk up from 1 and settle on `A1-03` — the one number we must not reissue.
   */
  private async floorInUse(series: string): Promise<number> {
    const [, kind, base] = series.split('.');
    switch (kind) {
      case 'head': {
        const codes = await this.prisma.headAccount.findMany({
          where: { code: { startsWith: base } },
          select: { code: true },
        });
        return this.floor(highestSerial(codes.map((c) => c.code), HEAD_SERIAL(base)), codes.length);
      }
      case 'subhead': {
        const codes = await this.prisma.subHead.findMany({
          where: { code: { startsWith: `${base}-` } },
          select: { code: true },
        });
        return this.floor(
          highestSerial(codes.map((c) => c.code), SUB_HEAD_SERIAL(base)),
          codes.length,
        );
      }
      default: {
        const codes = await this.prisma.mainAccount.findMany({
          where: { code: { startsWith: `${base}-` } },
          select: { code: true },
        });
        return this.floor(
          highestSerial(codes.map((c) => c.code), MAIN_ACCOUNT_SERIAL(base)),
          codes.length,
        );
      }
    }
  }

  private floor(highest: number, count: number): number {
    return Math.max(highest, count);
  }
}
