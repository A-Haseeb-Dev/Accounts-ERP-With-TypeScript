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

export default function SalesBookPage() {
  const { options: customerOptions } = useFlatOptions('customers');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [status, setStatus] = useState('posted');

  const { data, isLoading, isError, refetch } = useQuery<{ rows: Row[]; subtotal: number; tax: number; grandTotal: number }>({
    queryKey: ['sales-book', from, to, customerId, status],
    queryFn: () => apiFetch('/reports/sales-book' + qs({ from: from || undefined, to: to || undefined, customerId: customerId || undefined, status })),
  });

  const rows = data?.rows ?? [];
  const totalSales = rows.reduce((s, r) => s + Number(r.grandTotal ?? 0), 0);
  const totalPaid = rows.reduce((s, r) => s + Number(r.amountPaid ?? 0), 0);

  return (
    <div>
      <PageHeader
        title="Sales Book"
        description="Posted sales invoices summary."
        actions={
          <ReportActions
            tableId="sb-report"
            filename="sales-book"
            title={`Sales Book ${from ? `(${from} to ${to || from})` : ''}`}
          />
        }
      />

      <Card>
        <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 px-4 py-3">
          <Field label="From"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" /></Field>
          <Field label="To"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" /></Field>
          <Field label="Customer">
            <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">All customers</option>
              {customerOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
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

        <div id="sb-report" className="overflow-x-auto">
          {isLoading ? (
            <TableSkeleton rows={7} columns={6} />
          ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Number</th>
                <th className="px-4 py-2">Customer</th>
                <th className="px-4 py-2 text-right">Total</th>
                <th className="px-4 py-2 text-right">Paid</th>
                <th className="px-4 py-2 text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const bal = Number(r.grandTotal ?? 0) - Number(r.amountPaid ?? 0);
                return (
                  <tr key={String(r.id)} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-2 text-slate-600">{r.saleDate ? new Date(String(r.saleDate)).toLocaleDateString('en-GB') : '—'}</td>
                    <td className="px-4 py-2 font-mono font-semibold text-slate-800">{String(r.number)}</td>
                    <td className="px-4 py-2 text-slate-700">{String((r.customer as Row)?.name ?? '-')}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium text-slate-800">{money(r.grandTotal, 'PKR')}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-700">{money(r.amountPaid, 'PKR')}</td>
                    <td className={`px-4 py-2 text-right tabular-nums font-medium ${bal > 0.01 ? 'text-red-600' : 'text-teal-600'}`}>{money(bal, 'PKR')}</td>
                  </tr>
                );
              })}
              {rows.length === 0 && !isLoading && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No sales found.</td></tr>
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-800">
                  <td colSpan={3} className="px-4 py-2 text-xs font-semibold uppercase text-slate-500">Totals</td>
                  <td className="px-4 py-2 text-right tabular-nums">{money(totalSales, 'PKR')}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{money(totalPaid, 'PKR')}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{money(totalSales - totalPaid, 'PKR')}</td>
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