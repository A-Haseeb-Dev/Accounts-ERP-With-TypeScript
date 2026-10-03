import { describe, it, expect } from 'vitest';
import {
  ACCOUNT_LETTERS,
  MAIN_ACCOUNT_PAD,
  SUB_HEAD_PAD,
  formatHeadCode,
  formatMainAccountCode,
  formatSubHeadCode,
  headCodeBase,
  highestSerial,
  isAccountType,
  letterForType,
  subHeadCodeBase,
  typeForLetter,
  HEAD_SERIAL,
  MAIN_ACCOUNT_SERIAL,
  SUB_HEAD_SERIAL,
} from './account-code';

describe('account code scheme', () => {
  it('maps each account type to its statement letter', () => {
    expect(letterForType('ASSET')).toBe('A');
    expect(letterForType('LIABILITY')).toBe('L');
    expect(letterForType('EQUITY')).toBe('P');
    expect(letterForType('REVENUE')).toBe('R');
    expect(letterForType('EXPENSE')).toBe('E');
    expect(ACCOUNT_LETTERS.ASSET).toBe('A');
  });

  it('starts every series at 1', () => {
    expect(formatHeadCode('A', 1)).toBe('A1');
    expect(formatHeadCode('L', 1)).toBe('L1');
    expect(formatHeadCode('E', 1)).toBe('E1');
    expect(formatHeadCode('R', 1)).toBe('R1');
    expect(formatHeadCode('P', 1)).toBe('P1');
  });

  it('extends a head code with a 2-digit sub head serial', () => {
    expect(formatSubHeadCode('A1', 1)).toBe('A1-01');
    expect(formatSubHeadCode('A1', 12)).toBe('A1-12');
    expect(SUB_HEAD_PAD).toBe(2);
  });

  it('extends a sub head code with a 4-digit main account serial', () => {
    expect(formatMainAccountCode('A1-01', 1)).toBe('A1-01-0001');
    expect(formatMainAccountCode('A1-01', 42)).toBe('A1-01-0042');
    expect(MAIN_ACCOUNT_PAD).toBe(4);
  });

  it('reads the account type back out of a head letter', () => {
    expect(typeForLetter('A')).toBe('ASSET');
    expect(typeForLetter('l')).toBe('LIABILITY');
    expect(typeForLetter('P')).toBe('EQUITY');
  });

  it('treats an unrecognised type as an asset rather than throwing', () => {
    // Defensive: a bad letter must not be able to corrupt a code prefix.
    expect(typeForLetter('Z')).toBe('ASSET');
    expect(typeForLetter('')).toBe('ASSET');
  });

  it('validates account types strictly', () => {
    expect(isAccountType('ASSET')).toBe(true);
    expect(isAccountType('asset')).toBe(false);
    expect(isAccountType('NONSENSE')).toBe(false);
    expect(isAccountType(undefined)).toBe(false);
  });

  it('extracts the head and sub head portions of a code', () => {
    expect(headCodeBase('A1-01-0001')).toBe('A1');
    expect(headCodeBase('A1')).toBe('A1');
    expect(subHeadCodeBase('A1-01-0001')).toBe('A1-01');
    expect(subHeadCodeBase('A1')).toBeNull();
  });

  it('finds the highest serial already used in a head series', () => {
    expect(highestSerial(['A1', 'A2', 'A10'], HEAD_SERIAL('A'))).toBe(10);
    expect(highestSerial([], HEAD_SERIAL('A'))).toBe(0);
    // Other letters must not raise the count.
    expect(highestSerial(['A1', 'L1', 'P1'], HEAD_SERIAL('A'))).toBe(1);
  });

  it('counts only the sub heads of the given head', () => {
    expect(highestSerial(['A1-01', 'A1-02', 'A1-11'], SUB_HEAD_SERIAL('A1'))).toBe(11);
    // A2's sub heads belong to a different series.
    expect(highestSerial(['A2-01', 'A2-02'], SUB_HEAD_SERIAL('A1'))).toBe(0);
  });

  it('counts only the accounts of the given sub head', () => {
    expect(
      highestSerial(['A1-01-0001', 'A1-01-0002', 'A1-01-0010'], MAIN_ACCOUNT_SERIAL('A1-01')),
    ).toBe(10);
    // Sibling sub head accounts must not leak into this series.
    expect(
      highestSerial(['A1-02-0005', 'A1-02-0006'], MAIN_ACCOUNT_SERIAL('A1-01')),
    ).toBe(0);
  });

  it('does not let a regex metacharacter in a code widen the match', () => {
    expect(highestSerial(['A1.01-0009'], MAIN_ACCOUNT_SERIAL('A1-01'))).toBe(0);
  });

  it('ignores blank and non-numeric codes when counting', () => {
    expect(highestSerial(['', '  ', 'A1', 'ABC', 'A1-XX'], HEAD_SERIAL('A'))).toBe(1);
  });
});
