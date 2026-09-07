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
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [status, setStatus] = useState('posted');

  const { data, isLoading, isError, refetch } = useQuery<{ rows: Purchase[]; grandTotal: number }>({
    queryKey: ['purchase-book', from, to, supplierId, status],
    queryFn: () => apiFetch('/reports/purchase-book' + qs({ from: from || undefined, to: to || undefined, supplierId: supplierId || undefined, status })),
  });

  const rows = data?.rows ?? [];
  const totalPurchases = rows.reduce((s, r) => s + r.grandTotal, 0);

  return (
    <div>
      <PageHeader
        title="Purchase Book"
        description="Posted purchase invoices summary."
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
              <option value="">All</option>
            </Select>
          </Field>
          <div className="ml-auto">
            <ColumnPicker defs={COLUMNS} visible={cols.visible} onToggle={cols.toggle} />
          </div>
        </div>

        {isError && <div className="border-b border-slate-100 px-4 py-3"><QueryError onRetry={() => refetch()} /></div>}

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
                  {cols.isVisible('total') && <td className="px-4 py-2 text-right tabular-nums font-medium text-slate-800">{money(r.grandTotal, 'PKR')}</td>}
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
                  {cols.isVisible('total') && <td className="px-4 py-2 text-right tabular-nums">{money(totalPurchases, 'PKR')}</td>}
                  {cols.isVisible('status') && <td></td>}
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