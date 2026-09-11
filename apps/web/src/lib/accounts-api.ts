// Typed API accessors for the Accounts module.
import { apiFetch } from './api';
import type {
  Voucher,
  VoucherType,
  VoucherStatus,
} from './types';

export interface VoucherPayload {
  voucherType: VoucherType;
  voucherDate: string;
  reference?: string;
  description?: string;
  entries: { mainAccountId: string; debit: number; credit: number; narration?: string }[];
}

export const createVoucher = (payload: VoucherPayload) =>
  apiFetch<Voucher>('/vouchers', { method: 'POST', body: JSON.stringify(payload) });

export const updateVoucher = (id: string, payload: VoucherPayload) =>
  apiFetch<Voucher>(`/vouchers/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });

export const deleteVoucher = (id: string) =>
  apiFetch<{ success: boolean }>(`/vouchers/${id}`, { method: 'DELETE' });
