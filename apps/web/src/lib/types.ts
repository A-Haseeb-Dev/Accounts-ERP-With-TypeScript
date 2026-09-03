// Domain types for the Accounts module (Chart of Accounts + Vouchers).

export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
export type AccountStatus = 'active' | 'inactive';
export type VoucherType = 'JOURNAL' | 'CREDIT' | 'DEBIT';
export type VoucherStatus = 'draft' | 'posted' | 'cancelled';

export interface HeadAccount {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  status: AccountStatus;
  sortOrder?: number;
  createdAt: string;
  updatedAt: string;
}

export interface SubHead {
  id: string;
  code: string;
  name: string;
  headId: string;
  status: AccountStatus;
  head?: { id: string; code: string; name: string; type: AccountType };
  createdAt: string;
  updatedAt: string;
}

export interface MainAccount {
  id: string;
  code: string;
  name: string;
  subHeadId: string;
  openingBalance?: number;
  type?: string;
  status: AccountStatus;
  subHead?: { id: string; code: string; name: string; head?: { id: string; name: string; code: string; type: AccountType } };
  createdAt: string;
  updatedAt: string;
}

/** Flat option (id/label/code) plus the head type for typed selects. */
export interface AccountNode {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  level: 'head' | 'subhead' | 'main';
  parentId?: string;
}

export interface VoucherEntry {
  id?: string;
  mainAccountId: string;
  debit: number;
  credit: number;
  narration?: string;
  account?: { id: string; code: string; name: string };
}

export interface Voucher {
  id: string;
  voucherNumber: string;
  voucherType: VoucherType;
  voucherDate: string;
  reference?: string;
  description?: string;
  status: VoucherStatus;
  totalDebit: number;
  totalCredit: number;
  entries: VoucherEntry[];
  createdAt: string;
  updatedAt: string;
}