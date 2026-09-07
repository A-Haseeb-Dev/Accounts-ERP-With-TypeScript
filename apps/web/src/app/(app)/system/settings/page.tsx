'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { useFlatOptions } from '@/hooks/use-options';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';

type Settings = Record<string, string>;

export default function SettingsPage() {
  const qc = useQueryClient();
  const { options: locationOptions } = useFlatOptions('stock-locations');
  const { options: customerOptions } = useFlatOptions('customers');
  const { options: supplierOptions } = useFlatOptions('suppliers');

  const { data, isLoading } = useQuery<Settings>({
    queryKey: ['settings'],
    queryFn: () => apiFetch('/system/settings'),
  });

  const [form, setForm] = useState<Settings>({});
  const [error, setError] = useState('');

  const save = useMutation({
    mutationFn: (payload: unknown) => apiFetch('/system/settings', { method: 'PATCH', body: JSON.stringify(payload) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['settings'] }); },
    onError: (e: Error) => setError(e.message),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    save.mutate({
      currency: form.currency || undefined,
      dateFormat: form.dateFormat || undefined,
      timezone: form.timezone || undefined,
      invoicePrefix: form.invoicePrefix || undefined,
      purchasePrefix: form.purchasePrefix || undefined,
      salesReturnPrefix: form.salesReturnPrefix || undefined,
      purchaseReturnPrefix: form.purchaseReturnPrefix || undefined,
      stockTransferPrefix: form.stockTransferPrefix || undefined,
      voucherPrefix: form.voucherPrefix || undefined,
      invoiceShowBalance: form.invoiceShowBalance || undefined,
      invoiceShowAmountWords: form.invoiceShowAmountWords || undefined,
      invoiceShowDate: form.invoiceShowDate || undefined,
      reportShowBranding: form.reportShowBranding || undefined,
      reportShowLogo: form.reportShowLogo || undefined,
      negativeInventory: form.negativeInventory || undefined,
      defaultStockLocationId: form.defaultStockLocationId || undefined,
      defaultCustomerId: form.defaultCustomerId || undefined,
      defaultSupplierId: form.defaultSupplierId || undefined,
      values: {
        'fiscal.locked_until': form.lockedUntil || '',
        'numbering.template': form['numbering.template'] || undefined,
        'numbering.padding': form['numbering.padding'] || undefined,
      },
    });
  };

  const merged: Settings = { ...(data ?? {}), ...form };
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const importBackup = useMutation({
    mutationFn: (payload: unknown) => apiFetch('/system/settings/import', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] });
      qc.invalidateQueries({ queryKey: ['branding'] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const exportBackup = async () => {
    setError('');
    try {
      const payload = await apiFetch('/system/settings/export') as { exportedAt?: string };
      const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `has-erp-backup-${(payload.exportedAt ?? new Date().toISOString()).slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed');
    }
  };

  const onPickBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    try {
      await importBackup.mutateAsync(JSON.parse(await file.text()));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed. Make sure the file is a valid JSON backup.');
    }
  };

  return (
    <div>
      <PageHeader title="Settings" description="Global system configuration." />
      <Card>
        {isLoading ? null : (
          <form onSubmit={submit} className="max-w-2xl space-y-5 p-5">
            <div>
              <p className="mb-3 text-sm font-semibold text-slate-700">Regional</p>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Currency"><Input value={merged.currency ?? 'PKR'} onChange={(e) => set('currency', e.target.value)} /></Field>
                <Field label="Date Format"><Input value={merged.dateFormat ?? 'MM/DD/YYYY'} onChange={(e) => set('dateFormat', e.target.value)} /></Field>
                <Field label="Timezone"><Input value={merged.timezone ?? 'Asia/Karachi'} onChange={(e) => set('timezone', e.target.value)} /></Field>
              </div>
            </div>

            <div>
              <p className="mb-3 text-sm font-semibold text-slate-700">Numbering</p>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Invoice Prefix"><Input value={merged.invoicePrefix ?? ''} onChange={(e) => set('invoicePrefix', e.target.value)} placeholder="SI" /></Field>
                <Field label="Purchase Prefix"><Input value={merged.purchasePrefix ?? ''} onChange={(e) => set('purchasePrefix', e.target.value)} placeholder="PI" /></Field>
                <Field label="Sales Return Prefix"><Input value={merged.salesReturnPrefix ?? ''} onChange={(e) => set('salesReturnPrefix', e.target.value)} placeholder="SR" /></Field>
                <Field label="Purchase Return Prefix"><Input value={merged.purchaseReturnPrefix ?? ''} onChange={(e) => set('purchaseReturnPrefix', e.target.value)} placeholder="PR" /></Field>
                <Field label="Stock Transfer Prefix"><Input value={merged.stockTransferPrefix ?? ''} onChange={(e) => set('stockTransferPrefix', e.target.value)} placeholder="ST" /></Field>
                <Field label="Voucher Prefix"><Input value={merged.voucherPrefix ?? ''} onChange={(e) => set('voucherPrefix', e.target.value)} placeholder="JV" /></Field>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-4">
                <Field
                  label="Number Template"
                  hint="Tokens: {prefix} {year} {month} {day} {company} {seq}"
                >
                  <Input value={String(form['numbering.template'] ?? merged['numbering.template'] ?? '{prefix}-{year}-{seq}')} onChange={(e) => set('numbering.template', e.target.value)} className="font-mono" />
                </Field>
                <Field
                  label="Sequence Padding (digits)"
                  hint="e.g. 6 → 000123, 3 → 123"
                >
                  <Input type="number" min={1} max={10} value={String(form['numbering.padding'] ?? merged['numbering.padding'] ?? '6')} onChange={(e) => set('numbering.padding', e.target.value)} />
                </Field>
              </div>
              <p className="mt-3 text-xs text-slate-400">Numbers are generated from the template, e.g. SI-2026-000123. The company token uses your Short Name from Branding. Leave blank to use defaults.</p>
            </div>

            <div>
              <p className="mb-3 text-sm font-semibold text-slate-700">Print Format</p>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Invoice — Show Balance Due">
                  <Select value={merged.invoiceShowBalance ?? 'true'} onChange={(e) => set('invoiceShowBalance', e.target.value)}>
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                  </Select>
                </Field>
                <Field label="Invoice — Show Amount in Words">
                  <Select value={merged.invoiceShowAmountWords ?? 'true'} onChange={(e) => set('invoiceShowAmountWords', e.target.value)}>
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                  </Select>
                </Field>
                <Field label="Invoice — Show Date">
                  <Select value={merged.invoiceShowDate ?? 'true'} onChange={(e) => set('invoiceShowDate', e.target.value)}>
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                  </Select>
                </Field>
                <Field label="Reports — Show Company Branding">
                  <Select value={merged.reportShowBranding ?? 'false'} onChange={(e) => set('reportShowBranding', e.target.value)}>
                    <option value="false">No</option>
                    <option value="true">Yes</option>
                  </Select>
                </Field>
                <Field label="Reports — Show Logo">
                  <Select value={merged.reportShowLogo ?? 'false'} onChange={(e) => set('reportShowLogo', e.target.value)}>
                    <option value="false">No</option>
                    <option value="true">Yes</option>
                  </Select>
                </Field>
              </div>
            </div>

            <div>
              <p className="mb-3 text-sm font-semibold text-slate-700">Inventory</p>
              <Field label="Allow Negative Inventory">
                <Select value={merged.negativeInventory ?? 'false'} onChange={(e) => set('negativeInventory', e.target.value)}>
                  <option value="false">No</option>
                  <option value="true">Yes</option>
                </Select>
              </Field>
            </div>

            <div>
              <p className="mb-3 text-sm font-semibold text-slate-700">Defaults</p>
              <div className="space-y-4">
                <Field label="Default Stock Location">
                  <Select value={merged.defaultStockLocationId ?? ''} onChange={(e) => set('defaultStockLocationId', e.target.value)}>
                    <option value="">—</option>
                    {locationOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </Select>
                </Field>
                <Field label="Default Customer">
                  <Select value={merged.defaultCustomerId ?? ''} onChange={(e) => set('defaultCustomerId', e.target.value)}>
                    <option value="">—</option>
                    {customerOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </Select>
                </Field>
                <Field label="Default Supplier">
                  <Select value={merged.defaultSupplierId ?? ''} onChange={(e) => set('defaultSupplierId', e.target.value)}>
                    <option value="">—</option>
                    {supplierOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </Select>
                </Field>
              </div>
            </div>

            <div>
              <p className="mb-3 text-sm font-semibold text-slate-700">Fiscal Period</p>
              <div className="grid grid-cols-2 gap-4">
                <Field
                  label="Lock Vouchers Up To"
                  hint="Posting or changing vouchers on or before this date is blocked. Leave empty to unlock."
                >
                  <Input
                    type="date"
                    value={merged.lockedUntil ?? ''}
                    onChange={(e) => set('lockedUntil', e.target.value)}
                  />
                </Field>
              </div>
            </div>

            <div>
              <p className="mb-3 text-sm font-semibold text-slate-700">Backup &amp; Restore</p>
              <p className="mb-3 text-xs text-slate-500">Download all settings, branding and numbering counters as one JSON file, then restore them on this or another machine.</p>
              <div className="flex items-center gap-3">
                <Button type="button" variant="outline" onClick={exportBackup}>Export Backup (JSON)</Button>
                <label className="cursor-pointer">
                  <span className="inline-flex h-9 items-center justify-center rounded-md border border-slate-300 px-4 text-sm font-medium text-slate-600 hover:bg-slate-50">
                    {importBackup.isPending ? 'Restoring…' : 'Restore Backup…'}
                  </span>
                  <input type="file" accept="application/json,.json" className="hidden" onChange={onPickBackup} />
                </label>
              </div>
            </div>

            {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
            <div className="flex justify-end">
              <Button type="submit" loading={save.isPending}>Save Settings</Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}