'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/field';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';

type Branding = Record<string, unknown>;

export default function BrandingPage() {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery<Branding>({
    queryKey: ['branding'],
    queryFn: () => apiFetch('/system/branding'),
  });

  const [form, setForm] = useState<Branding>({});
  const [error, setError] = useState('');

  const save = useMutation({
    mutationFn: (payload: unknown) => apiFetch('/system/branding', { method: 'PATCH', body: JSON.stringify(payload) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['branding'] }); },
    onError: (e: Error) => setError(e.message),
  });

  const merged: Branding = { ...(data ?? {}), ...form };
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const payload: Record<string, unknown> = {};
    for (const k of ['businessName', 'shortName', 'logoUrl', 'faviconUrl', 'primaryColor', 'secondaryColor', 'invoiceFooter', 'invoiceTerms', 'reportFooter']) {
      const v = merged[k];
      if (v !== undefined && String(v).trim() !== '') payload[k] = v;
    }
    save.mutate(payload);
  };

  const colorPreview = String(merged.primaryColor ?? '#2563eb').match(/^#[0-9a-fA-F]{6}$/) ? merged.primaryColor as string : '#2563eb';
  const secondaryPreview = String(merged.secondaryColor ?? '#0f172a').match(/^#[0-9a-fA-F]{6}$/) ? merged.secondaryColor as string : '#0f172a';

  return (
    <div>
      <PageHeader title="Branding" description="Business identity for reports and invoices." />
      <Card>
        <div className="flex flex-wrap gap-6 p-5">
          <form onSubmit={submit} className="max-w-lg flex-1 space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Business Name"><Input value={String(merged.businessName ?? '')} onChange={(e) => set('businessName', e.target.value)} /></Field>
              <Field label="Short Name"><Input value={String(merged.shortName ?? '')} onChange={(e) => set('shortName', e.target.value)} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Primary Color"><Input type="color" value={String(colorPreview)} onChange={(e) => set('primaryColor', e.target.value)} className="h-10 p-1" /></Field>
              <Field label="Secondary Color"><Input type="color" value={secondaryPreview} onChange={(e) => set('secondaryColor', e.target.value)} className="h-10 p-1" /></Field>
            </div>
            <Field label="Logo URL"><Input value={String(merged.logoUrl ?? '')} onChange={(e) => set('logoUrl', e.target.value)} placeholder="https://…" /></Field>
            <Field label="Favicon URL"><Input value={String(merged.faviconUrl ?? '')} onChange={(e) => set('faviconUrl', e.target.value)} placeholder="https://…" /></Field>
            <Field label="Invoice Footer"><Textarea value={String(merged.invoiceFooter ?? '')} onChange={(e) => set('invoiceFooter', e.target.value)} /></Field>
            <Field label="Invoice Terms"><Textarea value={String(merged.invoiceTerms ?? '')} onChange={(e) => set('invoiceTerms', e.target.value)} /></Field>
            <Field label="Report Footer"><Textarea value={String(merged.reportFooter ?? '')} onChange={(e) => set('reportFooter', e.target.value)} /></Field>

            {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
            <div className="flex justify-end">
              <Button type="submit" loading={save.isPending}>Save Branding</Button>
            </div>
          </form>

          <div className="hidden w-64 shrink-0 sm:block">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Preview</p>
            <div className="overflow-hidden rounded-xl border border-slate-200 shadow-sm">
              <div className="px-4 py-5 text-white" style={{ backgroundColor: String(colorPreview) }}>
                <p className="text-lg font-bold">{String(merged.businessName ?? 'Your Business')}</p>
                <p className="text-xs opacity-80">{String(merged.shortName ?? '')}</p>
              </div>
              <div className="space-y-2 p-4">
                <div className="h-3 w-full rounded bg-slate-200" />
                <div className="h-3 w-5/6 rounded bg-slate-100" />
                <div className="mt-4 flex justify-between text-[11px] text-slate-500">
                  <span>Invoice total</span>
                  <span className="font-semibold text-slate-800">PKR 0.00</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}