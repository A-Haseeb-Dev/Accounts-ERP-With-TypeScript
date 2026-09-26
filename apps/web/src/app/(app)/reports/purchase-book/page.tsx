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
import type { Purchase } from '@/lib/types';

const COLUMNS: ColumnDef[] = [
  { key: 'date', header: 'Date' },
  { key: 'number', header: 'Number' },
  { key: 'supplier', header: 'Supplier' },
  { key: 'total', header: 'Total' },
  { key: 'status', header: 'Status' },
];

export default function PurchaseBookPage() {
  const { options: supplierOptions } = useFlatOptions('suppliers');
  const cols = useReportColumns(COLUMNS, 'purchase-book');
  const visibleMoney = cols.defsFiltered.filter((c) => c.key === 'total');
  const labelSpan = cols.defsFiltered.length - visibleMoney.length;
  const [mode, setMode] = useState<'byInvoice' | 'byMonth'>('byInvoice');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [status, setStatus] = useState('posted');

  const { data, isLoading, isError, refetch } = useQuery<{ rows: Purchase[]; grandTotal: number }>({
    queryKey: ['purchase-book', from, to, supplierId, status],
    queryFn: () => apiFetch('/reports/purchase-book' + qs({ from: from || undefined, to: to || undefined, supplierId: supplierId || undefined, status })),
  });

  const rows = data?.rows ?? [];
  const totalPurchases = rows.reduce((s, r) => s + Number(r.grandTotal), 0);

  const groups = (() => {
    if (mode !== 'byMonth') return [];
    const map = new Map<string, { key: string; monthLabel: string; rows: Purchase[]; total: number }>();
    for (const r of rows) {
      const d = new Date(r.purchaseDate);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const monthLabel = d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
      let g = map.get(key);
      if (!g) {
        g = { key, monthLabel, rows: [], total: 0 };
        map.set(key, g);
      }
      g.rows.push(r);
      g.total += Number(r.grandTotal);
    }
    return [...map.values()];
  })();

  return (
    <div>
      <PageHeader
        title="Purchase Book"
        description="Posted purchase invoices summary, with monthly categorization."
        actions={
          <ReportActions
            tableId="pb-report"
            filename="purchase-book"
            title={`Purchase Book ${from ? `(${from} to ${to || from})` : ''}`}
          />
        }
      />

      <Card>
        <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 px-4 py-3">
          <Field label="View">
            <Select value={mode} onChange={(e) => setMode(e.target.value as 'byInvoice' | 'byMonth')} className="w-36">
              <option value="byInvoice">By invoice</option>
              <option value="byMonth">By month</option>
            </Select>
          </Field>
          <Field label="From"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" /></Field>
          <Field label="To"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" /></Field>
          <Field label="Supplier">
            <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">All suppliers</option>
              {supplierOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </Field>
          <Field label="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="posted">Posted</option>
              {/* 'all' — an empty value is dropped by qs() and would silently fall back to "posted" */}
              <option value="all">All</option>
            </Select>
          </Field>
          {mode === 'byInvoice' && (
            <div className="ml-auto">
              <ColumnPicker defs={COLUMNS} visible={cols.visible} onToggle={cols.toggle} />
            </div>
          )}
        </div>

        {isError && <div className="border-b border-slate-100 px-4 py-3"><QueryError onRetry={() => refetch()} /></div>}

        {mode === 'byMonth' ? (
          <div id="pb-report" className="overflow-x-auto">
            <ReportPrintHeader title="Purchase Book — By Month" />
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2 text-sm">
              <span className="font-semibold text-slate-900">Purchases by Month</span>
              <span className="text-slate-500">{from ? `Period: ${from}${to ? ` to ${to}` : ''}` : 'All dates'} · {rows.length} invoice(s)</span>
            </div>
            {isLoading ? (
              <TableSkeleton rows={7} columns={5} />
            ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2">Invoice</th>
                  <th className="px-4 py-2">Supplier</th>
                  <th className="px-4 py-2 text-right">Total</th>
                  <th className="px-4 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {groups.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No purchases found.</td></tr>
                )}
                {groups.map((g) => (
                  <PurchaseGroupRows key={g.key} group={g} />
                ))}
                <tr className="border-t-2 border-slate-300 bg-slate-100 font-semibold text-slate-900">
                  <td className="px-4 py-2" colSpan={3}>Total</td>
                  <td className="px-4 py-2 text-right tabular-nums">{money(totalPurchases)}</td>
                  <td className="px-4 py-2"></td>
                </tr>
              </tbody>
            </table>
            )}
          </div>
        ) : (
        <div id="pb-report" className="overflow-x-auto">
          <ReportPrintHeader title="Purchase Book" />
          {isLoading ? (
            <TableSkeleton rows={7} columns={COLUMNS.length} />
          ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                {cols.defsFiltered.map((c) => (
                  <th key={c.key} className={`px-4 py-2 ${c.key === 'total' ? 'text-right' : ''}`}>{c.header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  {cols.isVisible('date') && <td className="px-4 py-2 text-slate-600">{new Date(r.purchaseDate).toLocaleDateString('en-GB')}</td>}
                  {cols.isVisible('number') && <td className="px-4 py-2 font-mono font-semibold text-slate-800">{r.number}</td>}
                  {cols.isVisible('supplier') && <td className="px-4 py-2 text-slate-700">{r.supplier?.name ?? '-'}</td>}
                  {cols.isVisible('total') && <td className="px-4 py-2 text-right tabular-nums font-medium text-slate-800">{money(r.grandTotal)}</td>}
                  {cols.isVisible('status') && <td className="px-4 py-2 text-slate-600">{r.status}</td>}
                </tr>
              ))}
              {rows.length === 0 && !isLoading && (
                <tr><td colSpan={cols.defsFiltered.length} className="px-4 py-8 text-center text-slate-400">No purchases found.</td></tr>
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-800">
                  <td colSpan={labelSpan} className="px-4 py-2 text-xs font-semibold uppercase text-slate-500">Total Purchases</td>
                  {cols.isVisible('total') && <td className="px-4 py-2 text-right tabular-nums">{money(totalPurchases)}</td>}
                  {cols.isVisible('status') && <td></td>}
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

function PurchaseGroupRows({ group }: { group: { key: string; monthLabel: string; rows: Purchase[]; total: number } }) {
  return (
    <>
      <tr className="border-b border-slate-200 bg-teal-50/60">
        <td className="px-4 py-1.5" colSpan={5}>
          <span className="text-xs font-bold uppercase tracking-wide text-teal-800">{group.monthLabel}</span>
          <span className="ml-2 text-xs text-slate-400">· {group.rows.length} invoice(s)</span>
        </td>
      </tr>
      {group.rows.map((r) => (
        <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
          <td className="px-4 py-2 text-slate-600">{new Date(r.purchaseDate).toLocaleDateString('en-GB')}</td>
          <td className="px-4 py-2 font-mono font-semibold text-slate-800">{r.number}</td>
          <td className="px-4 py-2 text-slate-700">{r.supplier?.name ?? '-'}</td>
          <td className="px-4 py-2 text-right tabular-nums font-medium text-slate-800">{money(Number(r.grandTotal))}</td>
          <td className="px-4 py-2 text-slate-600">{r.status}</td>
        </tr>
      ))}
      {group.rows.length >= 1 && (
        <tr className="border-b border-slate-200 bg-slate-50 text-[13px] font-semibold text-slate-700">
          <td className="px-4 py-1.5" colSpan={3}>Sub-total</td>
          <td className="px-4 py-1.5 text-right tabular-nums">{money(group.total)}</td>
          <td className="px-4 py-1.5"></td>
        </tr>
      )}
    </>
  );
}