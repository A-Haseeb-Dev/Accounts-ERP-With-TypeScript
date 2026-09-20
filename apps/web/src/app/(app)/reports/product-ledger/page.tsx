'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { apiFetch, qs } from '@/lib/api';
import { useItemOptions, useFlatOptions } from '@/hooks/use-options';
import { Field, Input, Select } from '@/components/ui/field';
import { PageHeader } from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { ReportActions } from '@/components/report-actions';
import { ReportPrintHeader } from '@/components/report-print-header';
import { ColumnPicker, useReportColumns, type ColumnDef } from '@/components/report-columns';
import { QueryError } from '@/components/query-error';
import { TableSkeleton } from '@/components/table-skeleton';
import { money } from '@/lib/utils';
import type { Item, ProductLedgerRow } from '@/lib/types';

const COLUMNS: ColumnDef[] = [
  { key: 'date', header: 'Date' },
  { key: 'type', header: 'Type' },
  { key: 'reference', header: 'Reference' },
  { key: 'qtyIn', header: 'Qty In' },
  { key: 'qtyOut', header: 'Qty Out' },
  { key: 'balance', header: 'Balance' },
  { key: 'value', header: 'Value' },
];

const SUMMARY_COLUMNS: { key: string; header: string; align?: 'right' }[] = [
  { key: 'code', header: 'Code' },
  { key: 'name', header: 'Item' },
  { key: 'brand', header: 'Brand' },
  { key: 'opening', header: 'Opening', align: 'right' },
  { key: 'stockIn', header: 'Qty In', align: 'right' },
  { key: 'stockOut', header: 'Qty Out', align: 'right' },
  { key: 'closing', header: 'Closing', align: 'right' },
  { key: 'value', header: 'Value', align: 'right' },
];

interface ProductSummaryRow {
  itemId: string;
  code: string;
  name: string;
  unit: string;
  itemTypeId: string | null;
  itemType: string;
  brand: string | null;
  opening: number;
  stockIn: number;
  stockOut: number;
  closing: number;
  value: number;
}

interface ProductSummaryGroup {
  itemTypeId: string | null;
  itemType: string;
  rows: ProductSummaryRow[];
  opening: number;
  stockIn: number;
  stockOut: number;
  closing: number;
  value: number;
}

interface ProductSummary {
  groups: ProductSummaryGroup[];
  rows: ProductSummaryRow[];
  totals: { opening: number; stockIn: number; stockOut: number; closing: number; value: number };
}

export default function ProductLedgerPage() {
  const { options: itemOptions } = useItemOptions();
  const { options: locationOptions } = useFlatOptions('stock-locations');
  const { options: itemTypeOptions } = useFlatOptions('item-types');
  const { options: brandOptions } = useFlatOptions('brands');
  const cols = useReportColumns(COLUMNS, 'product-ledger');
  const [mode, setMode] = useState<'detail' | 'summary'>('detail');
  const [itemId, setItemId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [itemTypeId, setItemTypeId] = useState('');
  const [brandId, setBrandId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const { data, isLoading, isError, refetch } = useQuery<{ rows: ProductLedgerRow[]; total: number; item?: Item }>({
    queryKey: ['product-ledger', itemId, locationId, from, to],
    queryFn: () => apiFetch('/reports/product-ledger' + qs({ itemId, locationId: locationId || undefined, from: from || undefined, to: to || undefined, pageSize: 100 })),
    enabled: mode === 'detail' && !!itemId,
  });

  const { data: summary } = useQuery<ProductSummary>({
    queryKey: ['product-ledger-summary', itemTypeId, brandId, locationId, from, to],
    queryFn: () => apiFetch('/reports/product-ledger-summary' + qs({ itemTypeId: itemTypeId || undefined, brandId: brandId || undefined, locationId: locationId || undefined, from: from || undefined, to: to || undefined })),
    enabled: mode === 'summary',
  });

  const hasQuery = mode === 'detail' ? !!itemId : mode === 'summary';

  return (
    <div>
      <PageHeader
        title="Product Ledger"
        description="Item-wise stock movement history."
        actions={
          <ReportActions
            tableId="pl-report"
            filename={mode === 'detail' ? 'product-ledger' : 'product-ledger-summary'}
            title={`${mode === 'detail' ? 'Product Ledger' : 'Product Ledger Summary'}${mode === 'detail' && data?.item?.name ? ` — ${data.item.name}` : ''}`}
            disabled={!hasQuery || isLoading}
          />
        }
      />

      <Card>
        <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 px-4 py-3">
          <Field label="View">
            <Select value={mode} onChange={(e) => setMode(e.target.value as 'detail' | 'summary')} className="w-44">
              <option value="detail">Single item</option>
              <option value="summary">By item type</option>
            </Select>
          </Field>

          {mode === 'detail' ? (
            <Field label="Item" className="flex-1">
              <Select value={itemId} onChange={(e) => setItemId(e.target.value)} required>
                <option value="">Select item…</option>
                {itemOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            </Field>
          ) : (
            <>
              <Field label="Item type" className="flex-1">
                <Select value={itemTypeId} onChange={(e) => setItemTypeId(e.target.value)}>
                  <option value="">All types</option>
                  {itemTypeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              </Field>
              <Field label="Brand">
                <Select value={brandId} onChange={(e) => setBrandId(e.target.value)} className="w-44">
                  <option value="">All brands</option>
                  {brandOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              </Field>
            </>
          )}

          <Field label="Location">
            <Select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              <option value="">All</option>
              {locationOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </Field>
          <Field label="From"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" /></Field>
          <Field label="To"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" /></Field>
          {mode === 'detail' && (
            <div className="ml-auto">
              <ColumnPicker defs={COLUMNS} visible={cols.visible} onToggle={cols.toggle} />
            </div>
          )}
        </div>

        {mode === 'detail' && !itemId && (
          <div className="px-4 py-10 text-center text-sm text-slate-400">Select an item to view its ledger.</div>
        )}

        {mode === 'detail' && itemId && (
          <>
            {isError && <div className="border-b border-slate-100 px-4 py-3"><QueryError onRetry={() => refetch()} /></div>}
            <div id="pl-report" className="overflow-x-auto">
            <ReportPrintHeader title="Product Ledger" />
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2 text-sm">
              <span className="text-slate-700">
                <span className="font-semibold text-slate-900">Product Ledger</span>
                {data?.item?.name && <span className="text-slate-500"> — {data.item.name}</span>}
              </span>
              <span className="text-slate-500">
                {[
                  locationOptions.find((o) => o.value === locationId)?.label,
                  from ? `Period: ${from}${to ? ` to ${to}` : ''}` : undefined,
                ].filter(Boolean).join(' · ') || 'All dates'}
              </span>
            </div>
            {isLoading ? (
              <TableSkeleton rows={6} columns={COLUMNS.length} />
            ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                  {cols.defsFiltered.map((c) => (
                    <th key={c.key} className={`px-4 py-2 ${['qtyIn', 'qtyOut', 'balance', 'value'].includes(c.key) ? 'text-right' : ''}`}>{c.header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(data?.rows ?? []).map((r, i) => {
                  const value = (r.balance ?? 0) * (r.unitCost ?? 0);
                  return (
                    <tr key={i} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                      {cols.isVisible('date') && <td className="px-4 py-2 text-slate-600">{r.date ? new Date(r.date).toLocaleDateString('en-GB') : '—'}</td>}
                      {cols.isVisible('type') && (
                        <td className="px-4 py-2">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${(r.stockIn ?? 0) > 0 ? 'bg-teal-50 text-teal-700' : 'bg-red-50 text-red-700'}`}>
                            {r.transactionType ?? ''}
                          </span>
                        </td>
                      )}
                      {cols.isVisible('reference') && <td className="px-4 py-2 font-mono text-xs text-slate-600">{r.referenceType ?? ''} {r.referenceId ? `(${r.referenceId.slice(0, 8)})` : ''}</td>}
                      {cols.isVisible('qtyIn') && <td className="px-4 py-2 text-right tabular-nums text-teal-600">{r.stockIn ? r.stockIn : ''}</td>}
                      {cols.isVisible('qtyOut') && <td className="px-4 py-2 text-right tabular-nums text-red-600">{r.stockOut ? r.stockOut : ''}</td>}
                      {cols.isVisible('balance') && <td className="px-4 py-2 text-right tabular-nums font-medium text-slate-800">{r.balance ?? 0}</td>}
                      {cols.isVisible('value') && <td className="px-4 py-2 text-right tabular-nums text-slate-700">{money(value, 'PKR')}</td>}
                    </tr>
                  );
                })}
                {(!data || data.rows.length === 0) && !isLoading && (
                  <tr><td colSpan={cols.defsFiltered.length} className="px-4 py-8 text-center text-slate-400">No movements found.</td></tr>
                )}
              </tbody>
            </table>
            )}
          </div>
          </>
        )}

        {mode === 'summary' && summary && (
          <div id="pl-report" className="overflow-x-auto">
            <ReportPrintHeader title="Product Ledger Summary" />
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2 text-sm">
              <span className="text-slate-700">
                <span className="font-semibold text-slate-900">Product Ledger Summary</span>
                {itemTypeId && <span className="text-slate-500"> — {itemTypeOptions.find((o) => o.value === itemTypeId)?.label ?? ''}</span>}
              </span>
              <span className="text-slate-500">
                {[
                  locationOptions.find((o) => o.value === locationId)?.label,
                  from ? `Period: ${from}${to ? ` to ${to}` : ''}` : undefined,
                ].filter(Boolean).join(' · ') || 'All dates'} · {summary.rows.length} item(s)
              </span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                  {SUMMARY_COLUMNS.map((c) => (
                    <th key={c.key} className={`px-4 py-2 ${c.align === 'right' ? 'text-right' : ''}`}>{c.header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {summary.groups.length === 0 && (
                  <tr><td colSpan={SUMMARY_COLUMNS.length} className="px-4 py-8 text-center text-slate-400">No items match the selected filters.</td></tr>
                )}
                {summary.groups.map((g) => (
                  <ProductGroupRows key={g.itemTypeId ?? g.itemType} group={g} />
                ))}
                <tr className="border-t-2 border-slate-300 bg-slate-100 font-semibold text-slate-900">
                  <td className="px-4 py-2" colSpan={3}>Total</td>
                  <td className="px-4 py-2 text-right tabular-nums">{summary.totals.opening}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-teal-700">{summary.totals.stockIn}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-red-700">{summary.totals.stockOut}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{summary.totals.closing}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{money(summary.totals.value, 'PKR')}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function ProductGroupRows({ group }: { group: ProductSummaryGroup }) {
  return (
    <>
      <tr className="border-b border-slate-200 bg-teal-50/60">
        <td className="px-4 py-1.5" colSpan={SUMMARY_COLUMNS.length}>
          <span className="text-xs font-bold uppercase tracking-wide text-teal-800">{group.itemType}</span>
          <span className="ml-2 text-xs text-slate-400">· {group.rows.length} item(s)</span>
        </td>
      </tr>
      {group.rows.map((r) => (
        <tr key={r.itemId} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
          <td className="px-4 py-2 font-mono text-slate-600">{r.code}</td>
          <td className="px-4 py-2 font-medium text-slate-800">{r.name}</td>
          <td className="px-4 py-2 text-slate-600">{r.brand ?? '—'}</td>
          <td className="px-4 py-2 text-right tabular-nums text-slate-600">{r.opening}</td>
          <td className="px-4 py-2 text-right tabular-nums text-teal-700">{r.stockIn}</td>
          <td className="px-4 py-2 text-right tabular-nums text-red-700">{r.stockOut}</td>
          <td className="px-4 py-2 text-right tabular-nums font-medium text-slate-900">{r.closing}</td>
          <td className="px-4 py-2 text-right tabular-nums text-slate-700">{money(r.value, 'PKR')}</td>
        </tr>
      ))}
      {group.rows.length > 1 && (
        <tr className="border-b border-slate-200 bg-slate-50 text-[13px] font-semibold text-slate-700">
          <td className="px-4 py-1.5" colSpan={3}>Sub-total</td>
          <td className="px-4 py-1.5 text-right tabular-nums">{group.opening}</td>
          <td className="px-4 py-1.5 text-right tabular-nums text-teal-700">{group.stockIn}</td>
          <td className="px-4 py-1.5 text-right tabular-nums text-red-700">{group.stockOut}</td>
          <td className="px-4 py-1.5 text-right tabular-nums">{group.closing}</td>
          <td className="px-4 py-1.5 text-right tabular-nums">{money(group.value, 'PKR')}</td>
        </tr>
      )}
    </>
  );
}