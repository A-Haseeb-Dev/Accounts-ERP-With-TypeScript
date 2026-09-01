'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { apiFetch, qs } from '@/lib/api';
import { useFlatOptions } from '@/hooks/use-options';
import { Field, Input, Select } from '@/components/ui/field';
import { PageHeader } from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { money } from '@/lib/utils';

type Row = Record<string, unknown>;

export default function StockReportPage() {
  const { options: locationOptions } = useFlatOptions('stock-locations');
  const { options: itemTypeOptions } = useFlatOptions('item-types');
  const { options: brandOptions } = useFlatOptions('brands');

  const [locationId, setLocationId] = useState('');
  const [itemTypeId, setItemTypeId] = useState('');
  const [brandId, setBrandId] = useState('');

  const { data, isLoading } = useQuery<{ items: Row[] }>({
    queryKey: ['stock-report', locationId, itemTypeId, brandId],
    queryFn: () => apiFetch('/reports/stock' + qs({ locationId: locationId || undefined, itemTypeId: itemTypeId || undefined, brandId: brandId || undefined })),
  });

  const totalQty = (data?.items ?? []).reduce((s, r) => s + Number(r.quantity ?? 0), 0);
  const totalValue = (data?.items ?? []).reduce((s, r) => s + Number(r.value ?? 0), 0);

  return (
    <div>
      <PageHeader title="Stock Report" description="Current stock quantities and values across locations." />

      <Card>
        <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 px-4 py-3">
          <Field label="Location"><Select value={locationId} onChange={(e) => setLocationId(e.target.value)}><option value="">All locations</option>{locationOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select></Field>
          <Field label="Type"><Select value={itemTypeId} onChange={(e) => setItemTypeId(e.target.value)}><option value="">All types</option>{itemTypeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select></Field>
          <Field label="Brand"><Select value={brandId} onChange={(e) => setBrandId(e.target.value)}><option value="">All brands</option>{brandOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select></Field>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                <th className="px-4 py-2">Code</th>
                <th className="px-4 py-2">Item</th>
                <th className="px-4 py-2">Type</th>
                <th className="px-4 py-2">Brand</th>
                <th className="px-4 py-2 text-right">Qty</th>
                <th className="px-4 py-2 text-right">Value</th>
              </tr>
            </thead>
            <tbody>
              {(data?.items ?? []).map((r) => (
                <tr key={String(r.id)} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-2 font-mono font-semibold text-slate-800">{String(r.code)}</td>
                  <td className="px-4 py-2 text-slate-700">{String(r.name)}</td>
                  <td className="px-4 py-2 text-xs text-slate-500">{String((r.itemType as Row)?.name ?? '-')}</td>
                  <td className="px-4 py-2 text-xs text-slate-500">{String((r.brand as Row)?.name ?? '-')}</td>
                  <td className="px-4 py-2 text-right tabular-nums font-medium text-slate-800">{String(r.quantity ?? 0)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-700">{money(r.value ?? 0, 'PKR')}</td>
                </tr>
              ))}
              {(!data || data.items.length === 0) && !isLoading && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No stock data.</td></tr>
              )}
            </tbody>
            {data && data.items.length > 0 && (
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-800">
                  <td colSpan={4} className="px-4 py-2 text-xs font-semibold uppercase text-slate-500">Totals</td>
                  <td className="px-4 py-2 text-right tabular-nums">{totalQty}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{money(totalValue, 'PKR')}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>
    </div>
  );
}