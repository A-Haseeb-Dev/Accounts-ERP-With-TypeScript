// Typed API accessors for the Accounts module.
import { apiFetch, qs } from './api';
import type {
  HeadAccount,
  SubHead,
  MainAccount,
  Voucher,
  VoucherType,
  VoucherStatus,
} from './types';

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ListOptions {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  voucherType?: VoucherType;
}

// ---------- Chart of Accounts ----------

export const fetchHeads = () => apiFetch<HeadAccount[]>('/administration/head-accounts');

export const fetchSubHeads = (headId?: string) =>
  apiFetch<SubHead[]>(headId ? `/administration/sub-heads?headId=${headId}` : '/administration/sub-heads');

export const fetchMainAccounts = () => apiFetch<MainAccount[]>('/administration/main-accounts');

// ---------- Vouchers ----------

export interface VoucherPayload {
  voucherType: VoucherType;
  voucherDate: string;
  reference?: string;
  description?: string;
  entries: { mainAccountId: string; debit: number; credit: number; narration?: string }[];
}

export const fetchVouchers = (opts: ListOptions & { status?: VoucherStatus } = {}) =>
  apiFetch<Page<Voucher>>(
    '/vouchers' + qs({ page: opts.page, pageSize: opts.pageSize, search: opts.search, status: opts.status, voucherType: opts.voucherType }),
  );

export const createVoucher = (payload: VoucherPayload) =>
  apiFetch<Voucher>('/vouchers', { method: 'POST', body: JSON.stringify(payload) });

export const updateVoucher = (id: string, payload: VoucherPayload) =>
  apiFetch<Voucher>(`/vouchers/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });

export const deleteVoucher = (id: string) =>
  apiFetch<{ success: boolean }>(`/vouchers/${id}`, { method: 'DELETE' });

export const postVoucher = (id: string) => apiFetch(`/vouchers/${id}/post`, { method: 'POST' });