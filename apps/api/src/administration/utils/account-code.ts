/**
 * Chart of Accounts code scheme.
 *
 *   Head account   A1        type letter + sequence        (A1, A2, L1, P1, R1, E1)
 *   Sub head       A1-01     head code + 2-digit serial   (A1-01, A1-02, L2-01)
 *   Main account   A1-01-0001 sub head code + 4-digit serial
 *
 * The type letter of a head is fixed by its account type, and every level below
 * inherits the code of its parent. That makes a code self-describing: the first
 * character tells you the statement a balance belongs to, which is what the
 * reports group on.
 *
 * Codes are assigned by the server only. Users cannot type them, so a code can
 * never contradict the hierarchy it sits in.
 */

export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';

export const ACCOUNT_TYPES: readonly AccountType[] = [
  'ASSET',
  'LIABILITY',
  'EQUITY',
  'REVENUE',
  'EXPENSE',
] as const;

/**
 * P = Proprietorship (equity), matching the account type name used everywhere
 * else in the app.
 */
export const ACCOUNT_LETTERS: Record<AccountType, string> = {
  ASSET: 'A',
  LIABILITY: 'L',
  EQUITY: 'P',
  REVENUE: 'R',
  EXPENSE: 'E',
};

export const LETTER_TO_TYPE: Record<string, AccountType> = {
  A: 'ASSET',
  L: 'LIABILITY',
  P: 'EQUITY',
  R: 'REVENUE',
  E: 'EXPENSE',
};

export const SUB_HEAD_PAD = 2;
export const MAIN_ACCOUNT_PAD = 4;

export function isAccountType(value: unknown): value is AccountType {
  return typeof value === 'string' && (ACCOUNT_TYPES as readonly string[]).includes(value);
}

export function letterForType(type: string): string {
  return isAccountType(type) ? ACCOUNT_LETTERS[type] : ACCOUNT_LETTERS.ASSET;
}

export function typeForLetter(letter: string): AccountType {
  return LETTER_TO_TYPE[letter.trim().charAt(0).toUpperCase()] ?? 'ASSET';
}

export function formatHeadCode(letter: string, serial: number): string {
  return `${letter.toUpperCase()}${serial}`;
}

export function formatSubHeadCode(headCode: string, serial: number): string {
  return `${headCode.trim()}-${String(serial).padStart(SUB_HEAD_PAD, '0')}`;
}

export function formatMainAccountCode(subHeadCode: string, serial: number): string {
  return `${subHeadCode.trim()}-${String(serial).padStart(MAIN_ACCOUNT_PAD, '0')}`;
}

/** "A1-01-0001" -> "A1"; the head portion of any code in the tree. */
export function headCodeBase(code: string): string {
  return code.trim().split('-')[0] ?? code.trim();
}

/** "A1-01" -> "01"; the sub head portion. */
export function subHeadCodeBase(code: string): string | null {
  const parts = code.trim().split('-');
  return parts.length >= 2 ? `${parts[0]}-${parts[1]}` : null;
}

/**
 * Highest serial already present in a series, so a freshly built chart continues
 * from the last used number rather than restarting at 1 and colliding with
 * rows created before the counters existed.
 *
 * `pattern` is matched against the whole code; the capture group holds the
 * digits of the serial being counted.
 */
export function highestSerial(codes: string[], pattern: RegExp): number {
  let max = 0;
  for (const code of codes) {
    if (!code) continue;
    const m = pattern.exec(code.trim());
    if (!m) continue;
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
}

/** Codes of one letter's head series, e.g. A1, A2, A3. */
export const HEAD_SERIAL = (letter: string): RegExp =>
  new RegExp(`^${letter.toUpperCase()}(\\d+)$`);

/** Codes in one head's sub head series, e.g. A1-01, A1-02. */
export const SUB_HEAD_SERIAL = (headCode: string): RegExp =>
  new RegExp(`^${escapeRegExp(headCode.trim())}-(\\d+)$`);

/** Codes in one sub head's main account series, e.g. A1-01-0001. */
export const MAIN_ACCOUNT_SERIAL = (subHeadCode: string): RegExp =>
  new RegExp(`^${escapeRegExp(subHeadCode.trim())}-(\\d+)$`);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
