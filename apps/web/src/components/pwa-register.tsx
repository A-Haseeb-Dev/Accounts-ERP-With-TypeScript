'use client';

import { useEffect } from 'react';
import { isPwaEnabled } from '@/lib/pwa';

/**
 * Applies the developer-controlled PWA feature flag.
 *  ON  -> injects the web app manifest and registers the service worker.
 *  OFF -> removes the manifest and unregisters any previously installed worker
 *         so the app behaves like a plain website again.
 */
export function PwaRegister() {
  useEffect(() => {
    const enabled = isPwaEnabled();

    let manifestLink = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');

    if (enabled) {
      if (!manifestLink) {
        manifestLink = document.createElement('link');
        manifestLink.rel = 'manifest';
        manifestLink.href = '/manifest.webmanifest';
        document.head.appendChild(manifestLink);
      }

      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js').catch(() => {
          // Registration failure must never break the app.
        });
      }
    } else {
      manifestLink?.remove();

      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then((regs) => {
          regs.forEach((reg) => reg.unregister());
        });
      }
    }
  }, []);

  return null;
}
