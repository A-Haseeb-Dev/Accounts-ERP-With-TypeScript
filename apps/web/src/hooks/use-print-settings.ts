'use client';

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export interface PrintSettings {
  invoiceShowBalance: boolean;
  invoiceShowAmountWords: boolean;
  invoiceShowDate: boolean;
  reportShowBranding: boolean;
  reportShowLogo: boolean;
  paperSize: string;
  printScale: number;
}

const DEFAULTS: PrintSettings = {
  invoiceShowBalance: true,
  invoiceShowAmountWords: true,
  invoiceShowDate: true,
  reportShowBranding: false,
  reportShowLogo: false,
  paperSize: 'A4',
  printScale: 100,
};

const isTrue = (s?: string) => s === 'true';

/**
 * Shared print/report format preferences editable from the Settings page.
 * Applied by the invoice print template, the report print header and the
 * printElement() helper (via localStorage mirror for synchronous access).
 */
export function usePrintSettings(): PrintSettings {
  const { data } = useQuery<Record<string, string>>({
    queryKey: ['settings'],
    queryFn: () => apiFetch('/system/settings'),
    staleTime: Infinity,
  });

  const paperSize = (data?.['print.paperSize'] ?? DEFAULTS.paperSize).match(/^(A4|A5|Letter)$/)
    ? data?.['print.paperSize'] ?? DEFAULTS.paperSize
    : DEFAULTS.paperSize;
  const scaleRaw = Number(data?.['print.scale'] ?? DEFAULTS.printScale);
  const printScale = Number.isFinite(scaleRaw) ? Math.min(100, Math.max(50, scaleRaw)) : DEFAULTS.printScale;

  // Mirror paper/scale to localStorage so the synchronous printElement() in a
  // plain module can pick them up without a React context.
  useEffect(() => {
    try {
      localStorage.setItem('print.paperSize', paperSize);
      localStorage.setItem('print.scale', String(printScale));
    } catch {
      // Ignore storage errors (private mode etc.).
    }
  }, [paperSize, printScale]);

  return {
    invoiceShowBalance: data ? isTrue(data['print.invoiceShowBalance']) : DEFAULTS.invoiceShowBalance,
    invoiceShowAmountWords: data ? isTrue(data['print.invoiceShowAmountWords']) : DEFAULTS.invoiceShowAmountWords,
    invoiceShowDate: data ? isTrue(data['print.invoiceShowDate']) : DEFAULTS.invoiceShowDate,
    reportShowBranding: data ? isTrue(data['print.reportShowBranding']) : DEFAULTS.reportShowBranding,
    reportShowLogo: data ? isTrue(data['print.reportShowLogo']) : DEFAULTS.reportShowLogo,
    paperSize,
    printScale,
  };
}