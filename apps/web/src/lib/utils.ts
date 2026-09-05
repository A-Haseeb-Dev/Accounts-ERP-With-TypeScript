import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const money = (value: unknown, currency = 'PKR'): string => {
  const n = Number(value ?? 0);
  if (Number.isNaN(n)) return '-';
  return new Intl.NumberFormat('en-PK', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
};

export const num = (value: unknown): string => {
  const n = Number(value ?? 0);
  if (Number.isNaN(n)) return '-';
  return new Intl.NumberFormat('en-PK', { maximumFractionDigits: 2 }).format(n);
};

export const date = (value: unknown): string => {
  if (!value) return '-';
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
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

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

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

function integerToWords(n: number): string {
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

export const amountInWords = (value: unknown): string => {
  const n = Number(value ?? 0);
  if (Number.isNaN(n)) return '';
  const negative = n < 0;
  const abs = Math.round(Math.abs(n) * 100) / 100;
  const rupees = Math.floor(abs);
  const paise = Math.round((abs - rupees) * 100);
  let out = 'Rupees ' + integerToWords(rupees);
  out += paise > 0 ? ' and ' + integerToWords(paise) + ' Paisa Only' : ' Only';
  return (negative ? 'Minus ' : '') + out;
};