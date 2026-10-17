/**
 * PWA feature flag.
 *
 * The developer decides when the app behaves like an installable PWA:
 *  - NEXT_PUBLIC_PWA_ENABLED=true   -> PWA ON by default (manifest + service worker)
 *  - NEXT_PUBLIC_PWA_ENABLED=unset/false -> PWA OFF by default
 *
 * Runtime override (for quick testing without a rebuild) from the browser console:
 *   localStorage.setItem('has-erp-pwa', 'on');   // force enable
 *   localStorage.setItem('has-erp-pwa', 'off');  // force disable
 *   localStorage.removeItem('has-erp-pwa');      // back to env default
 */

const STORAGE_KEY = 'has-erp-pwa';

export function isPwaEnabled(): boolean {
  if (typeof window === 'undefined') return false;

  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    stored = null;
  }

  if (stored === 'on') return true;
  if (stored === 'off') return false;

  return process.env.NEXT_PUBLIC_PWA_ENABLED === 'true';
}

/** Developer helper: turn PWA on/off at runtime without rebuilding. */
export function setPwaEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
  // Reload so the manifest + service worker state are applied cleanly.
  window.location.reload();
}
