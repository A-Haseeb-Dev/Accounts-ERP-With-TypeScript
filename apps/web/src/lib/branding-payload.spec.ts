import { describe, it, expect } from 'vitest';
import { BRANDING_FIELDS, buildBrandingPayload } from './branding-payload';

describe('BRANDING_FIELDS', () => {
  it('includes the quotation fields the print templates read', () => {
    // printable-document builds the key as `<docType>Footer` / `<docType>Terms`
    // and QuotationPage passes docType="quotation", so these two have to exist.
    expect(BRANDING_FIELDS).toContain('quotationFooter');
    expect(BRANDING_FIELDS).toContain('quotationTerms');
  });

  it('has no duplicates', () => {
    expect(new Set(BRANDING_FIELDS).size).toBe(BRANDING_FIELDS.length);
  });
});

describe('buildBrandingPayload', () => {
  it('sends an empty string so a saved value can be cleared', () => {
    expect(buildBrandingPayload({ invoiceFooter: '' })).toEqual({ invoiceFooter: '' });
  });

  it('sends a blank-but-touched field as an empty string after trimming', () => {
    expect(buildBrandingPayload({ logoUrl: '   ' })).toEqual({ logoUrl: '' });
  });

  it('leaves untouched fields out entirely', () => {
    expect(buildBrandingPayload({ businessName: 'Acme' })).toEqual({ businessName: 'Acme' });
  });

  it('ignores fields the API does not accept', () => {
    expect(buildBrandingPayload({ businessName: 'Acme', id: 'x', hacker: 'y' })).toEqual({ businessName: 'Acme' });
  });

  it('ignores an explicit undefined rather than sending an empty value', () => {
    expect(buildBrandingPayload({ businessName: undefined, invoiceFooter: 'a' })).toEqual({ invoiceFooter: 'a' });
  });

  it('trims whitespace off a value it does send', () => {
    expect(buildBrandingPayload({ shortName: '  HAS  ' })).toEqual({ shortName: 'HAS' });
  });

  it('returns nothing to save when the form is untouched', () => {
    expect(buildBrandingPayload({})).toEqual({});
  });

  it('can clear several fields at once', () => {
    expect(buildBrandingPayload({ logoUrl: '', faviconUrl: '', quoteFooter: '' })).toEqual({
      logoUrl: '',
      faviconUrl: '',
    });
  });
});