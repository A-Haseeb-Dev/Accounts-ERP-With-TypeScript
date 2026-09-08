'use client';

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import {
  decodePrintLayout,
  defaultLayout,
  decodeLayoutOverrides,
  type PrintLayoutConfig,
  type PrintLayoutOverrides,
} from '@/lib/print-layout';

export type InvoiceTemplate = 'standard' | 'compact' | 'thermal' | 'custom';
export type PrintFontSize = 'small' | 'normal' | 'large';
export type PrintLogoSize = 'small' | 'medium' | 'large';
export type PrintHeaderAlign = 'left' | 'center';

export interface PrintSettings {
  invoiceShowBalance: boolean;
  invoiceShowAmountWords: boolean;
  invoiceShowDate: boolean;
  reportShowBranding: boolean;
  reportShowLogo: boolean;
  paperSize: string;
  printScale: number;
  invoiceTemplate: InvoiceTemplate;
  fontSize: PrintFontSize;
  logoSize: PrintLogoSize;
  invoiceShowSignatures: boolean;
  invoiceShowPartyContact: boolean;
  invoiceShowItemCode: boolean;
  invoiceShowDiscountCol: boolean;
  invoiceShowTaxCol: boolean;
  invoiceHeaderAlign: PrintHeaderAlign;
  showPageNumbers: boolean;
  customLayout: PrintLayoutConfig | null;
  /** Per document-type / warehouse layout overrides (see print-layout.ts). */
  customLayoutOverrides: PrintLayoutOverrides;
}

export const PRINT_DEFAULTS: PrintSettings = {
  invoiceShowBalance: true,
  invoiceShowAmountWords: true,
  invoiceShowDate: true,
  reportShowBranding: false,
  reportShowLogo: false,
  paperSize: 'A4',
  printScale: 100,
  invoiceTemplate: 'standard',
  fontSize: 'normal',
  logoSize: 'medium',
  invoiceShowSignatures: true,
  invoiceShowPartyContact: true,
  invoiceShowItemCode: true,
  invoiceShowDiscountCol: true,
  invoiceShowTaxCol: true,
  invoiceHeaderAlign: 'left',
  showPageNumbers: true,
  customLayout: defaultLayout(),
  customLayoutOverrides: {},
};

const isTrue = (s?: string) => s === 'true';
const pick = <T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T =>
  (allowed as readonly string[]).includes(value ?? '') ? (value as T) : fallback;

/**
 * Shared print/report format preferences editable from the Print Layout page.
 * Applied by the invoice print template, the report print header and the
 * printElement() helper (via localStorage mirror for synchronous access).
 */
export function usePrintSettings(): PrintSettings {
  const { data } = useQuery<Record<string, string>>({
    queryKey: ['settings'],
    queryFn: () => apiFetch('/system/settings'),
    staleTime: Infinity,
  });

  const paperSize = pick(
    data?.['print.paperSize'],
    ['A4', 'A5', 'Letter'] as const,
    PRINT_DEFAULTS.paperSize,
  );
  const scaleRaw = Number(data?.['print.scale'] ?? PRINT_DEFAULTS.printScale);
  const printScale = Number.isFinite(scaleRaw) ? Math.min(100, Math.max(50, scaleRaw)) : PRINT_DEFAULTS.printScale;
  const invoiceTemplate = pick(
    data?.['print.invoiceTemplate'],
    ['standard', 'compact', 'thermal', 'custom'] as const,
    PRINT_DEFAULTS.invoiceTemplate,
  );
  const fontSize = pick(
    data?.['print.fontSize'],
    ['small', 'normal', 'large'] as const,
    PRINT_DEFAULTS.fontSize,
  );
  const logoSize = pick(
    data?.['print.logoSize'],
    ['small', 'medium', 'large'] as const,
    PRINT_DEFAULTS.logoSize,
  );
  const invoiceHeaderAlign = pick(
    data?.['print.invoiceHeaderAlign'],
    ['left', 'center'] as const,
    PRINT_DEFAULTS.invoiceHeaderAlign,
  );
  const showPageNumbers = data ? isTrue(data['print.showPageNumbers']) : PRINT_DEFAULTS.showPageNumbers;
  const customLayout = data
    ? (decodePrintLayout(data['print.layout']) ?? PRINT_DEFAULTS.customLayout)
    : PRINT_DEFAULTS.customLayout;
  const customLayoutOverrides = data
    ? decodeLayoutOverrides(data['print.layoutOverrides'])
    : {};

  // Mirror paper/scale/template/page-numbers to localStorage so the synchronous
  // printElement() in a plain module can pick them up without a React context.
  useEffect(() => {
    try {
      localStorage.setItem('print.paperSize', paperSize);
      localStorage.setItem('print.scale', String(printScale));
      localStorage.setItem('print.invoiceTemplate', invoiceTemplate);
      localStorage.setItem('print.showPageNumbers', String(showPageNumbers));
    } catch {
      // Ignore storage errors (private mode etc.).
    }
  }, [paperSize, printScale, invoiceTemplate, showPageNumbers]);

  return {
    invoiceShowBalance: data ? isTrue(data['print.invoiceShowBalance']) : PRINT_DEFAULTS.invoiceShowBalance,
    invoiceShowAmountWords: data ? isTrue(data['print.invoiceShowAmountWords']) : PRINT_DEFAULTS.invoiceShowAmountWords,
    invoiceShowDate: data ? isTrue(data['print.invoiceShowDate']) : PRINT_DEFAULTS.invoiceShowDate,
    reportShowBranding: data ? isTrue(data['print.reportShowBranding']) : PRINT_DEFAULTS.reportShowBranding,
    reportShowLogo: data ? isTrue(data['print.reportShowLogo']) : PRINT_DEFAULTS.reportShowLogo,
    paperSize,
    printScale,
    invoiceTemplate,
    fontSize,
    logoSize,
    invoiceShowSignatures: data ? isTrue(data['print.invoiceShowSignatures']) : PRINT_DEFAULTS.invoiceShowSignatures,
    invoiceShowPartyContact: data ? isTrue(data['print.invoiceShowPartyContact']) : PRINT_DEFAULTS.invoiceShowPartyContact,
    invoiceShowItemCode: data ? isTrue(data['print.invoiceShowItemCode']) : PRINT_DEFAULTS.invoiceShowItemCode,
    invoiceShowDiscountCol: data ? isTrue(data['print.invoiceShowDiscountCol']) : PRINT_DEFAULTS.invoiceShowDiscountCol,
    invoiceShowTaxCol: data ? isTrue(data['print.invoiceShowTaxCol']) : PRINT_DEFAULTS.invoiceShowTaxCol,
    invoiceHeaderAlign,
    showPageNumbers,
    customLayout,
    customLayoutOverrides,
  };
}