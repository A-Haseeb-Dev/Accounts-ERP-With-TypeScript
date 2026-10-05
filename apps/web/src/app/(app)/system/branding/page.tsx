'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/field';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';
import { PageLoader } from '@/components/ui/spinner';
import { money } from '@/lib/utils';
import { buildBrandingPayload } from '@/lib/branding-payload';
import type { BrandingSetting } from '@/lib/types';

const MAX_IMAGE_BYTES = 1_500_000;
const HEX6 = /^#[0-9a-fA-F]{6}$/;

export default function BrandingPage() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<BrandingSetting | null>({
    queryKey: ['branding'],
    queryFn: () => apiFetch('/system/branding'),
  });

  const [form, setForm] = useState<Partial<BrandingSetting>>({});
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const save = useMutation({
    mutationFn: (payload: Record<string, string>) =>
      apiFetch('/system/branding', { method: 'PATCH', body: JSON.stringify(payload) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['branding'] });
      // Drop the local edits so the inputs fall back to what the server stored;
      // keeping them would leave a stale "unsaved" copy in every field.
      setForm({});
      setError('');
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
    onError: (e: Error) => setError(e.message),
  });

  const merged: Partial<BrandingSetting> = { ...(data ?? {}), ...form };
  const set = (k: keyof BrandingSetting, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const uploadImage = (field: 'logoUrl' | 'faviconUrl') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) {
      setError('Image too large. Please choose a file under 1.5 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setError('');
        set(field, reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const payload = buildBrandingPayload(form);
    if (Object.keys(payload).length === 0) {
      setError('Nothing to save yet.');
      return;
    }
    save.mutate(payload);
  };

  const colorPreview = HEX6.test(merged.primaryColor ?? '') ? (merged.primaryColor as string) : '#2563eb';
  const secondaryPreview = HEX6.test(merged.secondaryColor ?? '')
    ? (merged.secondaryColor as string)
    : '#0f172a';

  if (isLoading) return <PageLoader />;

  const imageField = (field: 'logoUrl' | 'faviconUrl', label: string, placeholder: string) => {
    const value = merged[field] ?? '';
    return (
      <Field label={label}>
        <div className="flex gap-2">
          <Input
            value={value}
            onChange={(e) => set(field, e.target.value)}
            placeholder={placeholder}
            className="min-w-0 flex-1"
          />
          <label className="cursor-pointer shrink-0 rounded-md border border-slate-300 px-3 text-sm font-medium leading-10 text-slate-600 hover:bg-slate-50">
            Upload
            <input
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,image/webp"
              className="hidden"
              onChange={uploadImage(field)}
            />
          </label>
          {value && (
            <Button type="button" variant="ghost" onClick={() => set(field, '')} className="shrink-0">
              Clear
            </Button>
          )}
        </div>
        {value && (
          <div className="mt-2 flex items-center gap-2">
            <img
              src={value}
              alt={`${label} preview`}
              className="h-10 w-10 rounded border border-slate-200 bg-white object-contain"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                setError(`${label} could not be loaded from that URL.`);
              }}
            />
            <span className="text-xs text-slate-400">
              {value.startsWith('data:') ? 'Uploaded from disk — embedded directly in prints.' : value}
            </span>
          </div>
        )}
      </Field>
    );
  };

  return (
    <div>
      <PageHeader title="Branding" description="Business identity for reports and invoices." />
      <Card>
        <div className="flex flex-wrap gap-6 p-5">
          <form onSubmit={submit} className="max-w-lg flex-1 space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Business Name">
                <Input value={merged.businessName ?? ''} onChange={(e) => set('businessName', e.target.value)} />
              </Field>
              <Field label="Short Name">
                <Input value={merged.shortName ?? ''} onChange={(e) => set('shortName', e.target.value)} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Primary Color">
                <Input
                  type="color"
                  value={colorPreview}
                  onChange={(e) => set('primaryColor', e.target.value)}
                  className="h-10 p-1"
                />
              </Field>
              <Field label="Secondary Color">
                <Input
                  type="color"
                  value={secondaryPreview}
                  onChange={(e) => set('secondaryColor', e.target.value)}
                  className="h-10 p-1"
                />
              </Field>
            </div>
            {imageField('logoUrl', 'Logo URL', 'https://… or upload from disk')}
            {imageField('faviconUrl', 'Favicon URL', 'https://… or upload from disk')}

            <p className="pt-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Company Contact (printed on invoices)
            </p>
            <Field label="Address">
              <Input value={merged.address ?? ''} onChange={(e) => set('address', e.target.value)} placeholder="Street, City" />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Phone">
                <Input value={merged.phone ?? ''} onChange={(e) => set('phone', e.target.value)} placeholder="+92 300 0000000" />
              </Field>
              <Field label="NTN">
                <Input value={merged.ntn ?? ''} onChange={(e) => set('ntn', e.target.value)} placeholder="1234567-8" />
              </Field>
            </div>
            <Field label="Email">
              <Input value={merged.email ?? ''} onChange={(e) => set('email', e.target.value)} placeholder="sales@…" />
            </Field>
            <Field label="Invoice Footer">
              <Textarea value={merged.invoiceFooter ?? ''} onChange={(e) => set('invoiceFooter', e.target.value)} />
            </Field>
            <Field label="Invoice Terms">
              <Textarea value={merged.invoiceTerms ?? ''} onChange={(e) => set('invoiceTerms', e.target.value)} />
            </Field>
            <Field label="Report Footer">
              <Textarea value={merged.reportFooter ?? ''} onChange={(e) => set('reportFooter', e.target.value)} />
            </Field>

            <div className="border-t border-slate-100 pt-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Per-Document Footer &amp; Terms (leave blank to fall back to Invoice Footer / Terms)
              </p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Field label="Sales Invoice Footer">
                  <Textarea className="h-20" value={merged.saleFooter ?? ''} onChange={(e) => set('saleFooter', e.target.value)} />
                </Field>
                <Field label="Sales Invoice Terms">
                  <Textarea className="h-20" value={merged.saleTerms ?? ''} onChange={(e) => set('saleTerms', e.target.value)} />
                </Field>
                <Field label="Quotation Footer">
                  <Textarea className="h-20" value={merged.quotationFooter ?? ''} onChange={(e) => set('quotationFooter', e.target.value)} />
                </Field>
                <Field label="Quotation Terms">
                  <Textarea className="h-20" value={merged.quotationTerms ?? ''} onChange={(e) => set('quotationTerms', e.target.value)} />
                </Field>
                <Field label="Purchase Bill Footer">
                  <Textarea className="h-20" value={merged.purchaseFooter ?? ''} onChange={(e) => set('purchaseFooter', e.target.value)} />
                </Field>
                <Field label="Purchase Bill Terms">
                  <Textarea className="h-20" value={merged.purchaseTerms ?? ''} onChange={(e) => set('purchaseTerms', e.target.value)} />
                </Field>
                <Field label="Sales Return Footer">
                  <Textarea className="h-20" value={merged.salesReturnFooter ?? ''} onChange={(e) => set('salesReturnFooter', e.target.value)} />
                </Field>
                <Field label="Sales Return Terms">
                  <Textarea className="h-20" value={merged.salesReturnTerms ?? ''} onChange={(e) => set('salesReturnTerms', e.target.value)} />
                </Field>
                <Field label="Purchase Return Footer">
                  <Textarea className="h-20" value={merged.purchaseReturnFooter ?? ''} onChange={(e) => set('purchaseReturnFooter', e.target.value)} />
                </Field>
                <Field label="Purchase Return Terms">
                  <Textarea className="h-20" value={merged.purchaseReturnTerms ?? ''} onChange={(e) => set('purchaseReturnTerms', e.target.value)} />
                </Field>
              </div>
            </div>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
            )}
            <div className="flex items-center justify-end gap-3">
              {saved && <span className="text-sm text-teal-600">Saved</span>}
              <Button type="submit" loading={save.isPending}>
                Save Branding
              </Button>
            </div>
          </form>

          <div className="hidden w-64 shrink-0 sm:block">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Preview</p>
            <div className="overflow-hidden rounded-xl border border-slate-200 shadow-sm">
              <div className="px-4 py-5 text-white" style={{ backgroundColor: colorPreview }}>
                <p className="text-lg font-bold">{merged.businessName || 'Your Business'}</p>
                <p className="text-xs opacity-80">{merged.shortName ?? ''}</p>
              </div>
              <div className="space-y-2 p-4">
                <div className="h-3 w-full rounded bg-slate-200" />
                <div className="h-3 w-5/6 rounded bg-slate-100" />
                <div className="mt-4 flex justify-between text-[11px] text-slate-500">
                  <span>Invoice total</span>
                  <span className="font-semibold text-slate-800">{money(0)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}