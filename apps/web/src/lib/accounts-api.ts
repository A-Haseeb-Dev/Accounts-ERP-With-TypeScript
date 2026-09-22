// Typed API accessors for the Accounts module.
import { apiFetch } from './api';
import type {
  Voucher,
  VoucherType,
  VoucherStatus,
  PaymentEntry,
  PaymentAllocation,
  OpenInvoice,
  PaymentMethod,
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

export const unpostVoucher = (id: string) =>
  apiFetch<Voucher>(`/vouchers/${id}/unpost`, { method: 'POST' });

export interface PaymentPayload {
  paymentType: 'RECEIPT' | 'PAYMENT';
  partyType: 'CUSTOMER' | 'SUPPLIER';
  partyId: string;
  mainAccountId?: string;
  method: PaymentMethod;
  chequeNumber?: string;
  bankAccountId?: string;
  pdcAccountId?: string;
  chequeDate?: string;
  amount: number;
  paymentDate?: string;
  reference?: string;
  narration?: string;
  allocations?: { documentType: 'SALE' | 'PURCHASE'; documentId: string; allocatedAmount: number }[];
}

export const createPayment = (payload: PaymentPayload) =>
  apiFetch<PaymentEntry>('/payments', { method: 'POST', body: JSON.stringify(payload) });

export const postPayment = (id: string) =>
  apiFetch<PaymentEntry>(`/payments/${id}/post`, { method: 'POST' });

export const depositCheque = (id: string) =>
  apiFetch<PaymentEntry>(`/payments/${id}/deposit`, { method: 'POST' });

export const bounceCheque = (id: string, reason: string) =>
  apiFetch<PaymentEntry>(`/payments/${id}/bounce`, { method: 'POST', body: JSON.stringify({ reason }) });

export const endorseCheque = (id: string, partyType: 'CUSTOMER' | 'SUPPLIER', partyId: string) =>
  apiFetch<PaymentEntry>(`/payments/${id}/endorse`, { method: 'POST', body: JSON.stringify({ partyType, partyId }) });

export interface EditChequePayload {
  chequeNumber?: string;
  bankAccountId?: string;
  chequeDate?: string;
  paymentDate?: string;
  amount?: number;
  partyType?: 'CUSTOMER' | 'SUPPLIER';
  partyId?: string;
  mainAccountId?: string;
  pdcAccountId?: string;
  reference?: string;
  narration?: string;
}

export const editCheque = (id: string, payload: EditChequePayload) =>
  apiFetch<PaymentEntry>(`/payments/${id}/cheque`, { method: 'PATCH', body: JSON.stringify(payload) });

export const cancelPayment = (id: string, reason: string) =>
  apiFetch<PaymentEntry>(`/payments/${id}/cancel`, { method: 'DELETE', body: JSON.stringify({ reason }) });

export const fetchOpenInvoices = (partyType: 'CUSTOMER' | 'SUPPLIER', partyId: string) =>
  apiFetch<OpenInvoice[]>(`/payments/open-invoices?partyType=${partyType}&partyId=${partyId}`);

export const fetchNextPaymentNumber = (paymentType: 'RECEIPT' | 'PAYMENT') =>
  apiFetch<{ number: string }>(`/payments/next-number?paymentType=${paymentType}`).then((r) => r.number);
