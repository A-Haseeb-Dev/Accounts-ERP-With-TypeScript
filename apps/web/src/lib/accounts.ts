// Chart of Accounts code scheme
// Head code starts with a type letter: A (Assets), L (Liabilities),
// E (Expenses), R (Revenue), P (Proprietorship). The head code is the letter
// plus a 1-digit sequence, e.g. A1. A sub head extends it with a 3-digit
// number, e.g. A1-001. A leaf (main) account extends with a 4-digit serial,
// e.g. A1-001-0001.

export const ACCOUNT_LETTERS: Record<string, string> = {
  ASSET: 'A',
  LIABILITY: 'L',
  EQUITY: 'P',
  REVENUE: 'R',
  EXPENSE: 'E',
};

export const LETTER_TO_TYPE: Record<string, string> = {
  A: 'ASSET',
  L: 'LIABILITY',
  E: 'EXPENSE',
  R: 'REVENUE',
  P: 'EQUITY',
};

export const ACCOUNT_TYPES = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'] as const;

export const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  ASSET: 'Assets',
  LIABILITY: 'Liabilities',
  EQUITY: 'Proprietorship',
  REVENUE: 'Revenue',
  EXPENSE: 'Expenses',
};

export function letterForType(type: string): string {
  return ACCOUNT_LETTERS[type] ?? 'A';
}

export function typeForLetter(letter: string): string {
  return LETTER_TO_TYPE[letter.toUpperCase()] ?? 'ASSET';
}

// Build the next head code for a given type, e.g. "A1" -> "A2".
export function nextHeadCode(type: string, existingCodes: string[]): string {
  const letter = letterForType(type);
  let max = 0;
  for (const code of existingCodes) {
    const m = new RegExp(`^${letter}(\\d+)$`, 'i').exec(code.trim());
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${letter}${max + 1}`;
}

// Build a sub head code "A1-001" under the given head code, from existing
// sub codes (which may be plain "001" or combined "A1-001" or "A1001").
export function nextSubHeadCode(headCode: string, existingSubCodes: string[]): string {
  let max = 0;
  for (const code of existingSubCodes) {
    if (!code) continue;
    const trimmed = code.trim();
    // Current scheme: "A1-001". Also tolerate "A1001" and plain "001".
    const parts = trimmed.split('-');
    const last = parts[parts.length - 1].trim();
    const num = parseInt(last, 10);
    if (!Number.isNaN(num)) max = Math.max(max, num);
  }
  return `${headCode.trim()}-${String(max + 1).padStart(3, '0')}`;
}

// Build a leaf/main account code "A1-001-00001" under a sub head code
// (5-digit serial).
export function nextMainAccountCode(subHeadCode: string, existingAccountCodes: string[]): string {
  let max = 0;
  for (const code of existingAccountCodes) {
    if (!code) continue;
    const parts = code.trim().split('-');
    const last = parts[parts.length - 1].trim();
    const num = parseInt(last, 10);
    if (!Number.isNaN(num)) max = Math.max(max, num);
  }
  return `${subHeadCode.trim()}-${String(max + 1).padStart(5, '0')}`;
}

export function headCodeBase(code: string): string {
  // e.g. "A1-001" -> "A1"
  return code.trim().split('-')[0] ?? code.trim();
}

// For editing a head, derive the code from the (possibly changed) type/letter.
// Keeps the existing numeric suffix when the letter is unchanged; otherwise
// uses the next available number for the new letter.
export function regenerateHeadCode(oldCode: string, type: string, existingCodes: string[]): string {
  const letter = letterForType(type);
  const oldLetter = headCodeBase(oldCode).charAt(0).toUpperCase();
  if (letter === oldLetter) return headCodeBase(oldCode);
  return nextHeadCode(type, existingCodes);
}
