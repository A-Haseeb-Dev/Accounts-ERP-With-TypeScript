import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { getAppCurrency, getCurrencyInfo } from './currency';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const money = (value: unknown, currency = getAppCurrency()): string => {
  const n = Number(value ?? 0);
  if (Number.isNaN(n)) return '-';
  const info = getCurrencyInfo(currency);
  return new Intl.NumberFormat(info.locale, {
    style: 'currency',
    currency: info.code,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
};

export const num = (value: unknown): string => {
  const n = Number(value ?? 0);
  if (Number.isNaN(n)) return '-';
  return new Intl.NumberFormat(getCurrencyInfo().locale, { maximumFractionDigits: 2 }).format(n);
};

export const dateTime = (value: unknown): string => {
  if (!value) return '-';
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export const initials = (name?: string | null): string => {
  if (!name) return '?';
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
};

const ONES = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  return TENS[tens] + (ones ? '-' + ONES[ones] : '');
}

function threeDigits(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  let out = '';
  if (hundreds) out += ONES[hundreds] + ' Hundred';
  if (rest) out += (out ? ' and ' : '') + twoDigits(rest);
  return out || 'Zero';
}

function integerToWordsIndian(n: number): string {
  if (n === 0) return 'Zero';
  const crore = Math.floor(n / 10000000);
  n %= 10000000;
  const lakh = Math.floor(n / 100000);
  n %= 100000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  const parts: string[] = [];
  if (crore) parts.push(threeDigits(crore) + ' Crore');
  if (lakh) parts.push(threeDigits(lakh) + ' Lakh');
  if (thousand) parts.push(threeDigits(thousand) + ' Thousand');
  if (n) parts.push(threeDigits(n));
  return parts.join(' ');
}

function integerToWordsWestern(n: number): string {
  if (n === 0) return 'Zero';
  const billion = Math.floor(n / 1000000000);
  n %= 1000000000;
  const million = Math.floor(n / 1000000);
  n %= 1000000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  const parts: string[] = [];
  if (billion) parts.push(threeDigits(billion) + ' Billion');
  if (million) parts.push(threeDigits(million) + ' Million');
  if (thousand) parts.push(threeDigits(thousand) + ' Thousand');
  if (n) parts.push(threeDigits(n));
  return parts.join(' ');
}

export const amountInWords = (value: unknown, currency = getAppCurrency()): string => {
  const n = Number(value ?? 0);
  if (Number.isNaN(n)) return '';
  const info = getCurrencyInfo(currency);
  const negative = n < 0;
  const abs = Math.round(Math.abs(n) * 100) / 100;
  const whole = Math.floor(abs);
  const fraction = Math.round((abs - whole) * 100);
  const integerToWords = info.scale === 'indian' ? integerToWordsIndian : integerToWordsWestern;
  let out = info.main + ' ' + integerToWords(whole);
  out += fraction > 0 ? ' and ' + integerToWords(fraction) + ' ' + info.minor + ' Only' : ' Only';
  return (negative ? 'Minus ' : '') + out;
};

export const normalizePhone = (value?: string | null): string => {
  if (!value) return '';
  const digits = value.replace(/[^\d]/g, '').replace(/^0+/, '');
  if (!digits) return '';
  if (digits.length >= 12 && digits.startsWith('92')) return digits;
  if (digits.length === 10 || digits.startsWith('3')) {
    return '92' + digits.replace(/^0+/, '');
  }
  if (digits.length > 10) return digits;
  return '92' + digits;
};

export const buildWhatsAppUrl = (
  phone?: string | null,
  text?: string,
): string | null => {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;
  return `https://wa.me/${normalized}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
};

export const isOverdue = (dueDate?: string, ref = new Date()): boolean => {
  if (!dueDate) return false;
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return false;
  const today = new Date(ref);
  today.setHours(0, 0, 0, 0);
  return due < today;
};

export const isDueSoon = (dueDate?: string, withinDays = 7, ref = new Date()): boolean => {
  if (!dueDate) return false;
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return false;
  const today = new Date(ref);
  today.setHours(0, 0, 0, 0);
  const horizon = new Date(today);
  horizon.setDate(horizon.getDate() + withinDays);
  horizon.setHours(23, 59, 59, 999);
  return !isOverdue(dueDate, ref) && due <= horizon;
};

export const dateOnly = (value?: string | Date | null): string => {
  if (!value) return '-';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};