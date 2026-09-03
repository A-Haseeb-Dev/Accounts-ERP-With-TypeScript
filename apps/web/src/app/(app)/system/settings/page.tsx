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
      voucherPrefix: form.voucherPrefix || undefined,
      negativeInventory: form.negativeInventory || undefined,
      defaultStockLocationId: form.defaultStockLocationId || undefined,
      defaultCustomerId: form.defaultCustomerId || undefined,
      defaultSupplierId: form.defaultSupplierId || undefined,
      values: {
        'fiscal.locked_until': form.lockedUntil || '',
      },
    });
  };

  const merged: Settings = { ...(data ?? {}), ...form };
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

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
              <p className="mb-3 text-sm font-semibold text-slate-700">Numbering Prefixes</p>
              <div className="grid grid-cols-3 gap-4">
                <Field label="Invoice"><Input value={merged.invoicePrefix ?? ''} onChange={(e) => set('invoicePrefix', e.target.value)} /></Field>
                <Field label="Purchase"><Input value={merged.purchasePrefix ?? ''} onChange={(e) => set('purchasePrefix', e.target.value)} /></Field>
                <Field label="Voucher"><Input value={merged.voucherPrefix ?? ''} onChange={(e) => set('voucherPrefix', e.target.value)} /></Field>
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