'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { BrandingSetting } from '@/lib/types';

/** Shown until a company saves its own branding, or when the row is missing. */
export const DEFAULT_BRANDING = {
  businessName: 'HAS ERP',
  shortName: 'HAS',
  primaryColor: '#0f766e',
  secondaryColor: '#0f172a',
};

/**
 * The company's saved branding (logo, name, colours), used everywhere the app
 * previously hardcoded "HAS ERP": the browser tab, the sidebar, the login
 * screen and the print templates.
 *
 * The API returns `null` on a company that has never saved branding, so this
 * always resolves to usable values by falling back to the defaults above.
 */
export function useBranding() {
  const { data, isLoading } = useQuery<BrandingSetting | null>({
    queryKey: ['branding'],
    queryFn: () => apiFetch('/system/branding'),
    staleTime: Infinity,
    retry: false,
  });

  const businessName = data?.businessName?.trim() || DEFAULT_BRANDING.businessName;
  const shortName = data?.shortName?.trim() || DEFAULT_BRANDING.shortName;
  const primaryColor = data?.primaryColor || DEFAULT_BRANDING.primaryColor;
  const secondaryColor = data?.secondaryColor || DEFAULT_BRANDING.secondaryColor;

  return {
    branding: data ?? null,
    isLoading,
    businessName,
    shortName,
    primaryColor,
    secondaryColor,
    logoUrl: data?.logoUrl || null,
    faviconUrl: data?.faviconUrl || null,
    hasBranding: Boolean(data),
  };
}