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
import type { CommissionReport } from '@/lib/types';

const COLUMNS: ColumnDef[] = [
  { key: 'date', header: 'Date' },
  { key: 'number', header: 'Invoice No' },
  { key: 'customer', header: 'Customer' },
  { key: 'subtotal', header: 'Subtotal' },
  { key: 'discount', header: 'Discount' },
  { key: 'tax', header: 'Tax' },
  { key: 'total', header: 'Total' },
  { key: 'commission', header: 'Commission' },
  { key: 'percent', header: 'Percent' },
  { key: 'status', header: 'Status' },
];

const MONEY_KEYS = ['subtotal', 'discount', 'tax', 'total', 'commission'];

const STATUS_OPTIONS = [
  { value: 'posted', label: 'Posted' },
  { value: 'pending', label: 'Pending' },
  { value: 'draft', label: 'Draft' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'all', label: 'All' },
];

export default function SalesCommissionReportPage() {
  const { options: customerOptions } = useFlatOptions('customers');
  const cols = useReportColumns(COLUMNS, 'sales-commission');
  const [view, setView] = useState<'invoices' | 'customer'>('invoices');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [status, setStatus] = useState('posted');

  const { data, isLoading, isError, refetch } = useQuery<CommissionReport>({
    queryKey: ['sales-commission-report', from, to, customerId, status],
    queryFn: () =>
      apiFetch(
        '/reports/sales-commission' +
          qs({ from: from || undefined, to: to || undefined, customerId: customerId || undefined, status }),
      ),
  });

  const rows = data?.rows ?? [];
  const summary = data?.summary ?? [];
  const totalCommission = data?.totalCommission ?? 0;
  const totalValue = data?.grandTotal ?? 0;
  const overallPercent = totalValue === 0 ? 0 : (totalCommission / totalValue) * 100;

  const period = from ? ` (${from}${to ? ` to ${to}` : ''})` : '';
  const moneyColCount = cols.defsFiltered.filter((c) => MONEY_KEYS.includes(c.key)).length;

  return (
    <div>
      <PageHeader
        title="Sales Commission Report"
        description="Commission earned on sales invoices, by invoice or by customer."
        actions={
          <ReportActions
            tableId="sc-report"
            filename="sales-commission"
            title={`Sales Commission Report${period}`}
          />
        }
      />

      <Card>
        <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 px-4 py-3">
          <Field label="View">
            <Select value={view} onChange={(e) => setView(e.target.value as 'invoices' | 'customer')} className="w-40">
              <option value="invoices">By invoice</option>
              <option value="customer">By customer</option>
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
            <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-32">
              {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </Field>
          {view === 'invoices' && (
            <div className="ml-auto">
              <ColumnPicker defs={COLUMNS} visible={cols.visible} onToggle={cols.toggle} />
            </div>
          )}
        </div>

        {isError && <div className="border-b border-slate-100 px-4 py-3"><QueryError onRetry={() => refetch()} /></div>}

        {view === 'customer' ? (
          <div id="sc-report" className="overflow-x-auto">
            <ReportPrintHeader title="Sales Commission Report — By Customer" />
            {isLoading ? (
              <TableSkeleton rows={7} columns={5} />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                    <th className="px-4 py-2">Customer</th>
                    <th className="px-4 py-2 text-right">Invoices</th>
                    <th className="px-4 py-2 text-right">Invoice Total</th>
                    <th className="px-4 py-2 text-right">Commission</th>
                    <th className="px-4 py-2 text-right">Percent</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No commission recorded in this period.</td></tr>
                  )}
                  {summary.map((s) => (
                    <tr key={s.partyId ?? s.party} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                      <td className="px-4 py-2 text-slate-700">{s.party || '—'}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-600">{s.invoices}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-700">{money(s.base)}</td>
                      <td className="px-4 py-2 text-right tabular-nums font-medium text-slate-800">{money(s.commission)}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-600">
                        {s.base === 0 ? '0.00' : `${((s.commission / s.base) * 100).toFixed(2)}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {summary.length > 0 && (
                  <tfoot>
                    <tr className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-800">
                      <td className="px-4 py-2 text-xs font-semibold uppercase text-slate-500">Totals</td>
                      <td className="px-4 py-2 text-right tabular-nums">{summary.reduce((a, s) => a + s.invoices, 0)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{money(totalValue)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{money(totalCommission)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{overallPercent.toFixed(2)}%</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            )}
          </div>
        ) : (
          <div id="sc-report" className="overflow-x-auto">
            <ReportPrintHeader title="Sales Commission Report" />
            {isLoading ? (
              <TableSkeleton rows={7} columns={cols.defsFiltered.length} />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                    {cols.defsFiltered.map((c) => (
                      <th key={c.key} className={`px-4 py-2 ${MONEY_KEYS.includes(c.key) ? 'text-right' : ''}`}>{c.header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                      {cols.isVisible('date') && <td className="px-4 py-2 text-slate-600">{new Date(r.date).toLocaleDateString('en-GB')}</td>}
                      {cols.isVisible('number') && <td className="px-4 py-2 font-mono font-semibold text-slate-800">{r.number}</td>}
                      {cols.isVisible('customer') && <td className="px-4 py-2 text-slate-700">{r.customer || '-'}</td>}
                      {cols.isVisible('subtotal') && <td className="px-4 py-2 text-right tabular-nums text-slate-700">{money(r.subtotal)}</td>}
                      {cols.isVisible('discount') && <td className="px-4 py-2 text-right tabular-nums text-slate-700">{money(r.discount)}</td>}
                      {cols.isVisible('tax') && <td className="px-4 py-2 text-right tabular-nums text-slate-700">{money(r.tax)}</td>}
                      {cols.isVisible('total') && <td className="px-4 py-2 text-right tabular-nums text-slate-700">{money(r.grandTotal)}</td>}
                      {cols.isVisible('commission') && <td className="px-4 py-2 text-right tabular-nums font-medium text-slate-800">{money(r.commission)}</td>}
                      {cols.isVisible('percent') && <td className="px-4 py-2 text-right tabular-nums text-slate-600">{r.commissionPercent.toFixed(2)}%</td>}
                      {cols.isVisible('status') && <td className="px-4 py-2 text-slate-600">{r.status}</td>}
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr><td colSpan={cols.defsFiltered.length} className="px-4 py-8 text-center text-slate-400">No commission recorded in this period.</td></tr>
                  )}
                </tbody>
                {rows.length > 0 && (
                  <tfoot>
                    <tr className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-800">
                      <td colSpan={cols.defsFiltered.length - moneyColCount} className="px-4 py-2 text-xs font-semibold uppercase text-slate-500">
                        Totals ({rows.length})
                      </td>
                      {cols.isVisible('subtotal') && <td className="px-4 py-2 text-right tabular-nums">{money(data?.subtotal ?? 0)}</td>}
                      {cols.isVisible('discount') && <td className="px-4 py-2" />}
                      {cols.isVisible('tax') && <td className="px-4 py-2" />}
                      {cols.isVisible('total') && <td className="px-4 py-2 text-right tabular-nums">{money(totalValue)}</td>}
                      {cols.isVisible('commission') && <td className="px-4 py-2 text-right tabular-nums">{money(totalCommission)}</td>}
                      {cols.isVisible('percent') && <td className="px-4 py-2 text-right tabular-nums">{overallPercent.toFixed(2)}%</td>}
                      {cols.isVisible('status') && <td className="px-4 py-2" />}
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
