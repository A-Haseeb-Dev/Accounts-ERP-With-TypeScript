'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { usePrintSettings } from '@/hooks/use-print-settings';
import type { BrandingSetting } from '@/lib/types';

/**
 * A company-branded heading rendered just above a report table. It lives
 * inside the same printable wrapper as the table, so `printElement` clones it
 * into the print job; it sits outside the `<table>` so CSV export is unaffected.
 *
 * Presence is controlled by the Print Format settings (report branding / logo).
 */
export function ReportPrintHeader({ title }: { title: string }) {
  const fmt = usePrintSettings();
  const { data: branding } = useQuery<BrandingSetting | null>({
    queryKey: ['branding'],
    queryFn: () => apiFetch('/system/branding'),
    staleTime: Infinity,
    enabled: fmt.reportShowBranding,
  });

  if (!fmt.reportShowBranding) return null;

  const primary = branding?.primaryColor ?? '#0f766e';
  const dark = '#0f172a';
  const muted = '#64748b';

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: '3px solid ' + primary,
        padding: '10px 16px',
        marginBottom: 8,
        printColorAdjust: 'exact',
      }}
    >
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        {fmt.reportShowLogo && branding?.logoUrl && (
          <img
            src={branding.logoUrl}
            alt=""
            style={{ width: 40, height: 40, objectFit: 'contain' }}
          />
        )}
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: primary }}>
            {String(branding?.businessName ?? '')}
          </div>
          {branding?.address && <div style={{ fontSize: 12, color: muted }}>{String(branding.address)}</div>}
          {(branding?.phone || branding?.email) && (
            <div style={{ fontSize: 12, color: muted }}>
              {[branding.phone, branding.email].filter(Boolean).join(' · ')}
            </div>
          )}
          {branding?.ntn && <div style={{ fontSize: 12, color: muted }}>NTN: {String(branding.ntn)}</div>}
        </div>
      </div>
      <div style={{ textAlign: 'right', fontSize: 14, fontWeight: 700, color: dark }}>{title}</div>
    </div>
  );
}