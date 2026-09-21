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
import type { Sale } from '@/lib/types';

const COLUMNS: ColumnDef[] = [
  { key: 'date', header: 'Date' },
  { key: 'number', header: 'Number' },
  { key: 'customer', header: 'Customer' },
  { key: 'total', header: 'Total' },
  { key: 'paid', header: 'Paid' },
  { key: 'balance', header: 'Balance' },
];

export default function SalesBookPage() {
  const { options: customerOptions } = useFlatOptions('customers');
  const cols = useReportColumns(COLUMNS, 'sales-book');
  const visibleMoney = cols.defsFiltered.filter((c) => c.key === 'total' || c.key === 'paid' || c.key === 'balance');
  const labelSpan = cols.defsFiltered.length - visibleMoney.length;
  const [mode, setMode] = useState<'byInvoice' | 'byMonth'>('byInvoice');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [status, setStatus] = useState('posted');

  const { data, isLoading, isError, refetch } = useQuery<{ rows: Sale[]; subtotal: number; tax: number; grandTotal: number }>({
    queryKey: ['sales-book', from, to, customerId, status],
    queryFn: () => apiFetch('/reports/sales-book' + qs({ from: from || undefined, to: to || undefined, customerId: customerId || undefined, status })),
  });

  const rows = data?.rows ?? [];
  const totalSales = rows.reduce((s, r) => s + Number(r.grandTotal), 0);
  const totalPaid = rows.reduce((s, r) => s + Number(r.amountPaid), 0);

  const groups = (() => {
    if (mode !== 'byMonth') return [];
    const map = new Map<string, { key: string; monthLabel: string; rows: Sale[]; total: number; paid: number }>();
    for (const r of rows) {
      const d = new Date(r.saleDate);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const monthLabel = d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
      let g = map.get(key);
      if (!g) {
        g = { key, monthLabel, rows: [], total: 0, paid: 0 };
        map.set(key, g);
      }
      g.rows.push(r);
      g.total += Number(r.grandTotal);
      g.paid += Number(r.amountPaid);
    }
    return [...map.values()];
  })();

  return (
    <div>
      <PageHeader
        title="Sales Book"
        description="Posted sales invoices summary, with monthly categorization."
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
          <Field label="View">
            <Select value={mode} onChange={(e) => setMode(e.target.value as 'byInvoice' | 'byMonth')} className="w-36">
              <option value="byInvoice">By invoice</option>
              <option value="byMonth">By month</option>
            </Select>
          </Field>
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
          {mode === 'byInvoice' && (
            <div className="ml-auto">
              <ColumnPicker defs={COLUMNS} visible={cols.visible} onToggle={cols.toggle} />
            </div>
          )}
        </div>

        {isError && <div className="border-b border-slate-100 px-4 py-3"><QueryError onRetry={() => refetch()} /></div>}

        {mode === 'byMonth' ? (
          <div id="sb-report" className="overflow-x-auto">
            <ReportPrintHeader title="Sales Book — By Month" />
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2 text-sm">
              <span className="font-semibold text-slate-900">Sales by Month</span>
              <span className="text-slate-500">{from ? `Period: ${from}${to ? ` to ${to}` : ''}` : 'All dates'} · {rows.length} invoice(s)</span>
            </div>
            {isLoading ? (
              <TableSkeleton rows={7} columns={6} />
            ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2">Invoice</th>
                  <th className="px-4 py-2">Customer</th>
                  <th className="px-4 py-2 text-right">Total</th>
                  <th className="px-4 py-2 text-right">Paid</th>
                  <th className="px-4 py-2 text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {groups.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No sales found.</td></tr>
                )}
                {groups.map((g) => (
                  <SalesGroupRows key={g.key} group={g} />
                ))}
                <tr className="border-t-2 border-slate-300 bg-slate-100 font-semibold text-slate-900">
                  <td className="px-4 py-2" colSpan={3}>Total</td>
                  <td className="px-4 py-2 text-right tabular-nums">{money(totalSales)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{money(totalPaid)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{money(totalSales - totalPaid)}</td>
                </tr>
              </tbody>
            </table>
            )}
          </div>
        ) : (
        <div id="sb-report" className="overflow-x-auto">
          <ReportPrintHeader title="Sales Book" />
          {isLoading ? (
            <TableSkeleton rows={7} columns={COLUMNS.length} />
          ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                {cols.defsFiltered.map((c) => (
                  <th key={c.key} className={`px-4 py-2 ${c.key === 'total' || c.key === 'paid' || c.key === 'balance' ? 'text-right' : ''}`}>{c.header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const bal = r.grandTotal - r.amountPaid;
                return (
                  <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    {cols.isVisible('date') && <td className="px-4 py-2 text-slate-600">{new Date(r.saleDate).toLocaleDateString('en-GB')}</td>}
                    {cols.isVisible('number') && <td className="px-4 py-2 font-mono font-semibold text-slate-800">{r.number}</td>}
                    {cols.isVisible('customer') && <td className="px-4 py-2 text-slate-700">{r.customer?.name ?? '-'}</td>}
                    {cols.isVisible('total') && <td className="px-4 py-2 text-right tabular-nums font-medium text-slate-800">{money(r.grandTotal)}</td>}
                    {cols.isVisible('paid') && <td className="px-4 py-2 text-right tabular-nums text-slate-700">{money(r.amountPaid)}</td>}
                    {cols.isVisible('balance') && <td className={`px-4 py-2 text-right tabular-nums font-medium ${bal > 0.01 ? 'text-red-600' : 'text-teal-600'}`}>{money(bal)}</td>}
                  </tr>
                );
              })}
              {rows.length === 0 && !isLoading && (
                <tr><td colSpan={cols.defsFiltered.length} className="px-4 py-8 text-center text-slate-400">No sales found.</td></tr>
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-800">
                  <td colSpan={labelSpan} className="px-4 py-2 text-xs font-semibold uppercase text-slate-500">Totals</td>
                  {cols.isVisible('total') && <td className="px-4 py-2 text-right tabular-nums">{money(totalSales)}</td>}
                  {cols.isVisible('paid') && <td className="px-4 py-2 text-right tabular-nums">{money(totalPaid)}</td>}
                  {cols.isVisible('balance') && <td className="px-4 py-2 text-right tabular-nums">{money(totalSales - totalPaid)}</td>}
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

function SalesGroupRows({ group }: { group: { key: string; monthLabel: string; rows: Sale[]; total: number; paid: number } }) {
  return (
    <>
      <tr className="border-b border-slate-200 bg-teal-50/60">
        <td className="px-4 py-1.5" colSpan={6}>
          <span className="text-xs font-bold uppercase tracking-wide text-teal-800">{group.monthLabel}</span>
          <span className="ml-2 text-xs text-slate-400">· {group.rows.length} invoice(s)</span>
        </td>
      </tr>
      {group.rows.map((r) => {
        const bal = Number(r.grandTotal) - Number(r.amountPaid);
        return (
          <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
            <td className="px-4 py-2 text-slate-600">{new Date(r.saleDate).toLocaleDateString('en-GB')}</td>
            <td className="px-4 py-2 font-mono font-semibold text-slate-800">{r.number}</td>
            <td className="px-4 py-2 text-slate-700">{r.customer?.name ?? '-'}</td>
            <td className="px-4 py-2 text-right tabular-nums font-medium text-slate-800">{money(Number(r.grandTotal))}</td>
            <td className="px-4 py-2 text-right tabular-nums text-slate-700">{money(Number(r.amountPaid))}</td>
            <td className={`px-4 py-2 text-right tabular-nums font-medium ${bal > 0.01 ? 'text-red-600' : 'text-teal-600'}`}>{money(bal)}</td>
          </tr>
        );
      })}
      {group.rows.length >= 1 && (
        <tr className="border-b border-slate-200 bg-slate-50 text-[13px] font-semibold text-slate-700">
          <td className="px-4 py-1.5" colSpan={3}>Sub-total</td>
          <td className="px-4 py-1.5 text-right tabular-nums">{money(group.total)}</td>
          <td className="px-4 py-1.5 text-right tabular-nums">{money(group.paid)}</td>
          <td className="px-4 py-1.5 text-right tabular-nums">{money(group.total - group.paid)}</td>
        </tr>
      )}
    </>
  );
}