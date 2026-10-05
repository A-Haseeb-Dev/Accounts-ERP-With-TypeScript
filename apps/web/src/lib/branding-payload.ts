/** Fields the branding API accepts, in the order the form shows them. */
export const BRANDING_FIELDS = [
  'businessName',
  'shortName',
  'logoUrl',
  'faviconUrl',
  'primaryColor',
  'secondaryColor',
  'address',
  'phone',
  'email',
  'ntn',
  'invoiceFooter',
  'invoiceTerms',
  'reportFooter',
  'quotationFooter',
  'quotationTerms',
  'saleFooter',
  'saleTerms',
  'purchaseFooter',
  'purchaseTerms',
  'salesReturnFooter',
  'salesReturnTerms',
  'purchaseReturnFooter',
  'purchaseReturnTerms',
] as const;

export type BrandingField = (typeof BRANDING_FIELDS)[number];

const KNOWN = new Set<string>(BRANDING_FIELDS);

/**
 * Builds the PATCH body from the fields the user actually edited.
 *
 * Two rules matter here:
 *
 *  - an untouched field is left out, so the server keeps its stored value and a
 *    multi-megabyte uploaded logo is not re-sent on every unrelated edit;
 *  - an empty string *is* sent, because it is how a saved footer or logo gets
 *    cleared. The API skips `undefined` only, so dropping blanks here would
 *    make every field impossible to clear once it had a value.
 */
export function buildBrandingPayload(edited: Record<string, string | undefined>): Record<string, string> {
  const payload: Record<string, string> = {};
  for (const [key, value] of Object.entries(edited)) {
    if (value === undefined || !KNOWN.has(key)) continue;
    payload[key] = value.trim();
  }
  return payload;
}