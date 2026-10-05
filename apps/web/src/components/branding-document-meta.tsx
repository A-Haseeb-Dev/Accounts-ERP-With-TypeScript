'use client';

import { useEffect } from 'react';
import { useBranding } from '@/hooks/use-branding';

/**
 * Applies the company's branding to the browser tab: the page title and the
 * favicon. Next.js only lets the root layout export static metadata, so this
 * updates the document directly once branding loads — otherwise every company
 * would be stuck with the "HAS ERP" title baked in at build time.
 *
 * Renders nothing.
 */
export function BrandingDocumentMeta() {
  const { businessName, faviconUrl, logoUrl } = useBranding();

  useEffect(() => {
    document.title = businessName;
  }, [businessName]);

  useEffect(() => {
    const icon = faviconUrl || logoUrl;
    if (!icon) return;

    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    // Guard against the query re-running and re-adding the same href.
    if (link.getAttribute('href') !== icon) link.setAttribute('href', icon);
  }, [faviconUrl, logoUrl]);

  return null;
}