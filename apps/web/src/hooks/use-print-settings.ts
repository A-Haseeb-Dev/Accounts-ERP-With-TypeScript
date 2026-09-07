'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export interface PrintSettings {
  invoiceShowBalance: boolean;
  invoiceShowAmountWords: boolean;
  invoiceShowDate: boolean;
  reportShowBranding: boolean;
  reportShowLogo: boolean;
}

const DEFAULTS: PrintSettings = {
  invoiceShowBalance: true,
  invoiceShowAmountWords: true,
  invoiceShowDate: true,
  reportShowBranding: false,
  reportShowLogo: false,
};

const isTrue = (s?: string) => s === 'true';

/**
 * Shared print/report format preferences editable from the Settings page.
 * Applied by the invoice print template and the report print header.
 */
export function usePrintSettings(): PrintSettings {
  const { data } = useQuery<Record<string, string>>({
    queryKey: ['settings'],
    queryFn: () => apiFetch('/system/settings'),
    staleTime: Infinity,
  });

  return {
    invoiceShowBalance: data ? isTrue(data['print.invoiceShowBalance']) : DEFAULTS.invoiceShowBalance,
    invoiceShowAmountWords: data ? isTrue(data['print.invoiceShowAmountWords']) : DEFAULTS.invoiceShowAmountWords,
    invoiceShowDate: data ? isTrue(data['print.invoiceShowDate']) : DEFAULTS.invoiceShowDate,
    reportShowBranding: data ? isTrue(data['print.reportShowBranding']) : DEFAULTS.reportShowBranding,
    reportShowLogo: data ? isTrue(data['print.reportShowLogo']) : DEFAULTS.reportShowLogo,
  };
}