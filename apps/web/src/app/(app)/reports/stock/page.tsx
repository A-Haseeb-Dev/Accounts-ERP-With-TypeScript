'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { apiFetch, qs } from '@/lib/api';
import { useFlatOptions } from '@/hooks/use-options';
import { Field, Input, Select } from '@/components/ui/field';
import { PageHeader } from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { ReportActions } from '@/components/report-actions';
import { QueryError } from '@/components/query-error';
import { TableSkeleton } from '@/components/table-skeleton';
import { money } from '@/lib/utils';
import type { StockReportRow } from '@/lib/types';

export default function StockReportPage() {
  const { options: locationOptions } = useFlatOptions('stock-locations');
  const { options: itemTypeOptions } = useFlatOptions('item-types');
  const { options: brandOptions } = useFlatOptions('brands');

  const [locationId, setLocationId] = useState('');
  const [itemTypeId, setItemTypeId] = useState('');
  const [brandId, setBrandId] = useState('');

  const { data, isLoading, isError, refetch } = useQuery<{ rows: StockReportRow[]; totalQty: number; totalValue: number }>({
    queryKey: ['stock-report', locationId, itemTypeId, brandId],
    queryFn: () => apiFetch('/reports/stock' + qs({ locationId: locationId || undefined, itemTypeId: itemTypeId || undefined, brandId: brandId || undefined })),
  });

  const rows = data?.rows ?? [];
  const totalQty = data?.totalQty ?? 0;
  const totalValue = data?.totalValue ?? 0;

  return (
    <div>
      <PageHeader
        title="Stock Report"
        description="Current stock quantities and values across locations."
        actions={
          <ReportActions
            tableId="stock-report"
            filename="stock-report"
            title={`Stock Report — as of ${new Date().toISOString().slice(0, 10)}`}
          />
        }
      />

      <Card>
        <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 px-4 py-3">
          <Field label="Location"><Select value={locationId} onChange={(e) => setLocationId(e.target.value)}><option value="">All locations</option>{locationOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select></Field>
          <Field label="Type"><Select value={itemTypeId} onChange={(e) => setItemTypeId(e.target.value)}><option value="">All types</option>{itemTypeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select></Field>
          <Field label="Brand"><Select value={brandId} onChange={(e) => setBrandId(e.target.value)}><option value="">All brands</option>{brandOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select></Field>
        </div>

        {isError && <div className="border-b border-slate-100 px-4 py-3"><QueryError onRetry={() => refetch()} /></div>}

        <div id="stock-report" className="overflow-x-auto">
          {isLoading ? (
            <TableSkeleton rows={7} columns={6} />
          ) : (
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
              {rows.map((r) => (
                <tr key={r.itemId ?? r.itemCode} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-2 font-mono font-semibold text-slate-800">{r.itemCode}</td>
                  <td className="px-4 py-2 text-slate-700">{r.itemName}</td>
                  <td className="px-4 py-2 text-xs text-slate-500">{r.itemType ?? '-'}</td>
                  <td className="px-4 py-2 text-xs text-slate-500">{r.brand ?? '-'}</td>
                  <td className="px-4 py-2 text-right tabular-nums font-medium text-slate-800">{r.quantity ?? 0}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-slate-700">{money(r.stockValue ?? 0, 'PKR')}</td>
                </tr>
              ))}
              {rows.length === 0 && !isLoading && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No stock data.</td></tr>
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-800">
                  <td colSpan={4} className="px-4 py-2 text-xs font-semibold uppercase text-slate-500">Totals</td>
                  <td className="px-4 py-2 text-right tabular-nums">{totalQty}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{money(totalValue, 'PKR')}</td>
                </tr>
              </tfoot>
            )}
          </table>
          )}
        </div>
      </Card>
    </div>
  );
}