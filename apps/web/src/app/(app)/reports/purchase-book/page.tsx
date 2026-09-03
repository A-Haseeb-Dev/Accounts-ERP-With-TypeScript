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

type Row = Record<string, unknown>;

export default function PurchaseBookPage() {
  const { options: supplierOptions } = useFlatOptions('suppliers');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [status, setStatus] = useState('posted');

  const { data, isLoading, isError, refetch } = useQuery<{ rows: Row[]; grandTotal: number }>({
    queryKey: ['purchase-book', from, to, supplierId, status],
    queryFn: () => apiFetch('/reports/purchase-book' + qs({ from: from || undefined, to: to || undefined, supplierId: supplierId || undefined, status })),
  });

  const rows = data?.rows ?? [];
  const totalPurchases = rows.reduce((s, r) => s + Number(r.grandTotal ?? 0), 0);

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
        </div>

        {isError && <div className="border-b border-slate-100 px-4 py-3"><QueryError onRetry={() => refetch()} /></div>}

        <div id="pb-report" className="overflow-x-auto">
          {isLoading ? (
            <TableSkeleton rows={7} columns={6} />
          ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Number</th>
                <th className="px-4 py-2">Supplier</th>
                <th className="px-4 py-2 text-right">Total</th>
                <th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={String(r.id)} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-2 text-slate-600">{r.purchaseDate ? new Date(String(r.purchaseDate)).toLocaleDateString('en-GB') : '—'}</td>
                  <td className="px-4 py-2 font-mono font-semibold text-slate-800">{String(r.number)}</td>
                  <td className="px-4 py-2 text-slate-700">{String((r.supplier as Row)?.name ?? '-')}</td>
                  <td className="px-4 py-2 text-right tabular-nums font-medium text-slate-800">{money(r.grandTotal, 'PKR')}</td>
                  <td className="px-4 py-2 text-slate-600">{String(r.status)}</td>
                </tr>
              ))}
              {rows.length === 0 && !isLoading && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No purchases found.</td></tr>
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-800">
                  <td colSpan={3} className="px-4 py-2 text-xs font-semibold uppercase text-slate-500">Total Purchases</td>
                  <td className="px-4 py-2 text-right tabular-nums">{money(totalPurchases, 'PKR')}</td>
                  <td></td>
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