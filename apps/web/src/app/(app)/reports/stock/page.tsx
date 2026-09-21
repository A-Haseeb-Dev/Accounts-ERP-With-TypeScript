'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { apiFetch, qs } from '@/lib/api';
import { useFlatOptions } from '@/hooks/use-options';
import { Field, Input, Select } from '@/components/ui/field';
import { PageHeader } from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { ReportActions } from '@/components/report-actions';
import { ReportPrintHeader } from '@/components/report-print-header';
import { ColumnPicker, useReportColumns, type ColumnDef } from '@/components/report-columns';
import { QueryError } from '@/components/query-error';
import { TableSkeleton } from '@/components/table-skeleton';
import { money } from '@/lib/utils';
import type { StockReportRow } from '@/lib/types';

const COLUMNS: ColumnDef[] = [
  { key: 'code', header: 'Code' },
  { key: 'item', header: 'Item' },
  { key: 'type', header: 'Type' },
  { key: 'brand', header: 'Brand' },
  { key: 'qty', header: 'Qty' },
  { key: 'value', header: 'Value' },
];

export default function StockReportPage() {
  const { options: locationOptions } = useFlatOptions('stock-locations');
  const { options: itemTypeOptions } = useFlatOptions('item-types');
  const { options: brandOptions } = useFlatOptions('brands');
  const cols = useReportColumns(COLUMNS, 'stock-report');
  const visibleMoney = cols.defsFiltered.filter((c) => c.key === 'qty' || c.key === 'value');
  const labelSpan = cols.defsFiltered.length - visibleMoney.length;

  const [mode, setMode] = useState<'byItem' | 'byType'>('byItem');
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

  const groups = (() => {
    if (mode !== 'byType') return [];
    const map = new Map<string, { key: string; typeName: string; rows: StockReportRow[]; qty: number; value: number }>();
    for (const r of rows) {
      const key = r.itemType ?? '(Uncategorised)';
      let g = map.get(key);
      if (!g) {
        g = { key, typeName: r.itemType ?? '', rows: [], qty: 0, value: 0 };
        map.set(key, g);
      }
      g.rows.push(r);
      g.qty += r.quantity ?? 0;
      g.value += r.stockValue ?? 0;
    }
    return [...map.values()];
  })();

  return (
    <div>
      <PageHeader
        title="Stock Report"
        description="Current stock quantities and values across locations, categorized by item type."
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
          <Field label="View">
            <Select value={mode} onChange={(e) => setMode(e.target.value as 'byItem' | 'byType')} className="w-36">
              <option value="byItem">By item</option>
              <option value="byType">By type</option>
            </Select>
          </Field>
          <Field label="Location"><Select value={locationId} onChange={(e) => setLocationId(e.target.value)}><option value="">All locations</option>{locationOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select></Field>
          <Field label="Type"><Select value={itemTypeId} onChange={(e) => setItemTypeId(e.target.value)}><option value="">All types</option>{itemTypeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select></Field>
          <Field label="Brand"><Select value={brandId} onChange={(e) => setBrandId(e.target.value)}><option value="">All brands</option>{brandOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select></Field>
          {mode === 'byItem' && (
            <div className="ml-auto">
              <ColumnPicker defs={COLUMNS} visible={cols.visible} onToggle={cols.toggle} />
            </div>
          )}
        </div>

        {isError && <div className="border-b border-slate-100 px-4 py-3"><QueryError onRetry={() => refetch()} /></div>}

        {mode === 'byType' ? (
          <div id="stock-report" className="overflow-x-auto">
            <ReportPrintHeader title="Stock Report — By Type" />
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2 text-sm">
              <span className="font-semibold text-slate-900">Stock by Item Type</span>
              <span className="text-slate-500">As of {new Date().toISOString().slice(0, 10)} · {rows.length} item(s)</span>
            </div>
            {isLoading ? (
              <TableSkeleton rows={7} columns={5} />
            ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                  <th className="px-4 py-2">Code</th>
                  <th className="px-4 py-2">Item</th>
                  <th className="px-4 py-2">Brand</th>
                  <th className="px-4 py-2 text-right">Qty</th>
                  <th className="px-4 py-2 text-right">Value</th>
                </tr>
              </thead>
              <tbody>
                {groups.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No stock data.</td></tr>
                )}
                {groups.map((g) => (
                  <StockGroupRows key={g.key} group={g} />
                ))}
                <tr className="border-t-2 border-slate-300 bg-slate-100 font-semibold text-slate-900">
                  <td className="px-4 py-2" colSpan={3}>Total</td>
                  <td className="px-4 py-2 text-right tabular-nums">{totalQty}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{money(totalValue)}</td>
                </tr>
              </tbody>
            </table>
            )}
          </div>
        ) : (
        <div id="stock-report" className="overflow-x-auto">
          <ReportPrintHeader title="Stock Report" />
          {isLoading ? (
            <TableSkeleton rows={7} columns={COLUMNS.length} />
          ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                {cols.defsFiltered.map((c) => (
                  <th key={c.key} className={`px-4 py-2 ${c.key === 'qty' || c.key === 'value' ? 'text-right' : ''}`}>{c.header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.itemId ?? r.itemCode} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  {cols.isVisible('code') && <td className="px-4 py-2 font-mono font-semibold text-slate-800">{r.itemCode}</td>}
                  {cols.isVisible('item') && <td className="px-4 py-2 text-slate-700">{r.itemName}</td>}
                  {cols.isVisible('type') && <td className="px-4 py-2 text-xs text-slate-500">{r.itemType ?? '-'}</td>}
                  {cols.isVisible('brand') && <td className="px-4 py-2 text-xs text-slate-500">{r.brand ?? '-'}</td>}
                  {cols.isVisible('qty') && <td className="px-4 py-2 text-right tabular-nums font-medium text-slate-800">{r.quantity ?? 0}</td>}
                  {cols.isVisible('value') && <td className="px-4 py-2 text-right tabular-nums text-slate-700">{money(r.stockValue ?? 0)}</td>}
                </tr>
              ))}
              {rows.length === 0 && !isLoading && (
                <tr><td colSpan={cols.defsFiltered.length} className="px-4 py-8 text-center text-slate-400">No stock data.</td></tr>
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-800">
                  <td colSpan={labelSpan} className="px-4 py-2 text-xs font-semibold uppercase text-slate-500">Totals</td>
                  {cols.isVisible('qty') && <td className="px-4 py-2 text-right tabular-nums">{totalQty}</td>}
                  {cols.isVisible('value') && <td className="px-4 py-2 text-right tabular-nums">{money(totalValue)}</td>}
                </tr>
              </tfoot>
            )}
          </table>
          )}
        </div>
        )}
      </Card>
    </div>
  );
}

function StockGroupRows({ group }: { group: { key: string; typeName: string; rows: StockReportRow[]; qty: number; value: number } }) {
  return (
    <>
      <tr className="border-b border-slate-200 bg-teal-50/60">
        <td className="px-4 py-1.5" colSpan={5}>
          <span className="text-xs font-bold uppercase tracking-wide text-teal-800">{group.typeName}</span>
          <span className="ml-2 text-xs text-slate-400">· {group.rows.length} item(s)</span>
        </td>
      </tr>
      {group.rows.map((r) => (
        <tr key={r.itemId ?? r.itemCode} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
          <td className="px-4 py-2 font-mono text-slate-600">{r.itemCode}</td>
          <td className="px-4 py-2 font-medium text-slate-800">{r.itemName}</td>
          <td className="px-4 py-2 text-xs text-slate-500">{r.brand ?? '-'}</td>
          <td className="px-4 py-2 text-right tabular-nums font-medium text-slate-800">{r.quantity ?? 0}</td>
          <td className="px-4 py-2 text-right tabular-nums text-slate-700">{money(r.stockValue ?? 0)}</td>
        </tr>
      ))}
      {group.rows.length >= 1 && (
        <tr className="border-b border-slate-200 bg-slate-50 text-[13px] font-semibold text-slate-700">
          <td className="px-4 py-1.5" colSpan={3}>Sub-total</td>
          <td className="px-4 py-1.5 text-right tabular-nums">{group.qty}</td>
          <td className="px-4 py-1.5 text-right tabular-nums">{money(group.value)}</td>
        </tr>
      )}
    </>
  );
}