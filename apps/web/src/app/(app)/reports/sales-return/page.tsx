'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Eye } from 'lucide-react';
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
import { ReturnItemsModal, type ReturnItemLine } from '@/components/return-items-modal';
import { money } from '@/lib/utils';
import type { SalesReturn, SalesReturnReport } from '@/lib/types';

const COLUMNS: ColumnDef[] = [
  { key: 'date', header: 'Date' },
  { key: 'number', header: 'Return No' },
  { key: 'customer', header: 'Customer' },
  { key: 'against', header: 'Against' },
  { key: 'items', header: 'Items' },
  { key: 'subtotal', header: 'Subtotal' },
  { key: 'tax', header: 'Tax' },
  { key: 'total', header: 'Total' },
  { key: 'status', header: 'Status' },
];

const MONEY_KEYS = ['subtotal', 'tax', 'total'];

const STATUS_OPTIONS = [
  { value: 'posted', label: 'Posted' },
  { value: 'pending', label: 'Pending' },
  { value: 'draft', label: 'Draft' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'all', label: 'All' },
];

export default function SalesReturnReportPage() {
  const { options: customerOptions } = useFlatOptions('customers');
  const cols = useReportColumns(COLUMNS, 'sales-return');
  const [view, setView] = useState<'summary' | 'items'>('summary');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [status, setStatus] = useState('posted');
  const [detail, setDetail] = useState<SalesReturn | null>(null);

  const { data, isLoading, isError, refetch } = useQuery<SalesReturnReport>({
    queryKey: ['sales-return-report', from, to, customerId, status],
    queryFn: () =>
      apiFetch(
        '/reports/sales-return' + qs({ from: from || undefined, to: to || undefined, customerId: customerId || undefined, status }),
      ),
  });

  const rows = data?.rows ?? [];
  const totalSubtotal = rows.reduce((s, r) => s + Number(r.subtotal), 0);
  const totalTax = rows.reduce((s, r) => s + Number(r.tax), 0);
  const totalValue = data?.total ?? 0;

  const itemLines = rows.flatMap((r) =>
    r.items.map((i) => ({
      key: `${r.id}-${i.id}`,
      returnNumber: r.number,
      date: r.returnDate,
      party: r.customer?.name ?? '-',
      itemCode: i.item?.code ?? '',
      itemName: i.item?.name ?? '-',
      quantity: Number(i.quantity),
      unitPrice: Number(i.unitPrice),
      tax: Number(i.tax),
      lineTotal: Number(i.lineTotal),
    })),
  );
  const itemQty = itemLines.reduce((s, l) => s + l.quantity, 0);
  const itemTax = itemLines.reduce((s, l) => s + l.tax, 0);
  const itemTotal = itemLines.reduce((s, l) => s + l.lineTotal, 0);

  const period = from ? ` (${from}${to ? ` to ${to}` : ''})` : '';
  const moneyColCount = cols.defsFiltered.filter((c) => MONEY_KEYS.includes(c.key)).length;

  return (
    <div>
      <PageHeader
        title="Sales Return Report"
        description="Sales returns by return note or by item, with value breakdown."
        actions={
          <ReportActions
            tableId="sr-report"
            filename="sales-return"
            title={`Sales Return Report${period}`}
          />
        }
      />

      <Card>
        <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 px-4 py-3">
          <Field label="View">
            <Select value={view} onChange={(e) => setView(e.target.value as 'summary' | 'items')} className="w-36">
              <option value="summary">By return</option>
              <option value="items">By item</option>
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
          {view === 'summary' && (
            <div className="ml-auto">
              <ColumnPicker defs={COLUMNS} visible={cols.visible} onToggle={cols.toggle} />
            </div>
          )}
        </div>

        {isError && <div className="border-b border-slate-100 px-4 py-3"><QueryError onRetry={() => refetch()} /></div>}

        {view === 'items' ? (
          <div id="sr-report" className="overflow-x-auto">
            <ReportPrintHeader title="Sales Return Report — By Item" />
            {isLoading ? (
              <TableSkeleton rows={7} columns={8} />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                    <th className="px-4 py-2">Return</th>
                    <th className="px-4 py-2">Date</th>
                    <th className="px-4 py-2">Customer</th>
                    <th className="px-4 py-2">Item</th>
                    <th className="px-4 py-2 text-right">Qty</th>
                    <th className="px-4 py-2 text-right">Rate</th>
                    <th className="px-4 py-2 text-right">Tax</th>
                    <th className="px-4 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {itemLines.length === 0 && (
                    <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">No sales returns found.</td></tr>
                  )}
                  {itemLines.map((l) => (
                    <tr key={l.key} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                      <td className="px-4 py-2 font-mono font-semibold text-slate-800">{l.returnNumber}</td>
                      <td className="px-4 py-2 text-slate-600">{new Date(l.date).toLocaleDateString('en-GB')}</td>
                      <td className="px-4 py-2 text-slate-700">{l.party}</td>
                      <td className="px-4 py-2 text-slate-700">
                        {l.itemName}
                        {l.itemCode && <span className="ml-1 text-xs text-slate-400">({l.itemCode})</span>}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-700">{l.quantity}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-700">{money(l.unitPrice)}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-700">{money(l.tax)}</td>
                      <td className="px-4 py-2 text-right tabular-nums font-medium text-slate-800">{money(l.lineTotal)}</td>
                    </tr>
                  ))}
                </tbody>
                {itemLines.length > 0 && (
                  <tfoot>
                    <tr className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-800">
                      <td colSpan={4} className="px-4 py-2 text-xs font-semibold uppercase text-slate-500">Totals</td>
                      <td className="px-4 py-2 text-right tabular-nums">{itemQty}</td>
                      <td className="px-4 py-2" />
                      <td className="px-4 py-2 text-right tabular-nums">{money(itemTax)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{money(itemTotal)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            )}
          </div>
        ) : (
          <div id="sr-report" className="overflow-x-auto">
            <ReportPrintHeader title="Sales Return Report" />
            {isLoading ? (
              <TableSkeleton rows={7} columns={cols.defsFiltered.length} />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                    {cols.defsFiltered.map((c) => (
                      <th key={c.key} className={`px-4 py-2 ${MONEY_KEYS.includes(c.key) ? 'text-right' : ''}`}>{c.header}</th>
                    ))}
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                      {cols.isVisible('date') && <td className="px-4 py-2 text-slate-600">{new Date(r.returnDate).toLocaleDateString('en-GB')}</td>}
                      {cols.isVisible('number') && <td className="px-4 py-2 font-mono font-semibold text-slate-800">{r.number}</td>}
                      {cols.isVisible('customer') && <td className="px-4 py-2 text-slate-700">{r.customer?.name ?? '-'}</td>}
                      {cols.isVisible('against') && <td className="px-4 py-2 font-mono text-slate-600">{r.sale?.number ?? '—'}</td>}
                      {cols.isVisible('items') && <td className="px-4 py-2 text-slate-600">{r.items.length}</td>}
                      {cols.isVisible('subtotal') && <td className="px-4 py-2 text-right tabular-nums text-slate-700">{money(r.subtotal)}</td>}
                      {cols.isVisible('tax') && <td className="px-4 py-2 text-right tabular-nums text-slate-700">{money(r.tax)}</td>}
                      {cols.isVisible('total') && <td className="px-4 py-2 text-right tabular-nums font-medium text-slate-800">{money(r.grandTotal)}</td>}
                      {cols.isVisible('status') && <td className="px-4 py-2 text-slate-600">{r.status}</td>}
                      <td className="px-4 py-2 text-right">
                        <button
                          onClick={() => setDetail(r)}
                          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-blue-700"
                          title="View return items"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr><td colSpan={cols.defsFiltered.length + 1} className="px-4 py-8 text-center text-slate-400">No sales returns found.</td></tr>
                  )}
                </tbody>
                {rows.length > 0 && (
                  <tfoot>
                    <tr className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-800">
                      <td colSpan={cols.defsFiltered.length - moneyColCount} className="px-4 py-2 text-xs font-semibold uppercase text-slate-500">
                        Totals ({rows.length})
                      </td>
                      {cols.isVisible('subtotal') && <td className="px-4 py-2 text-right tabular-nums">{money(totalSubtotal)}</td>}
                      {cols.isVisible('tax') && <td className="px-4 py-2 text-right tabular-nums">{money(totalTax)}</td>}
                      {cols.isVisible('total') && <td className="px-4 py-2 text-right tabular-nums">{money(totalValue)}</td>}
                      <td className="px-4 py-2" />
                    </tr>
                  </tfoot>
                )}
              </table>
            )}
          </div>
        )}
      </Card>

      {detail && (
        <ReturnItemsModal
          number={detail.number}
          date={detail.returnDate}
          partyLabel="Customer"
          partyName={detail.customer?.name ?? ''}
          againstLabel="Against Invoice"
          againstNumber={detail.sale?.number}
          status={detail.status}
          tax={Number(detail.tax)}
          grandTotal={Number(detail.grandTotal)}
          items={detail.items.map((i): ReturnItemLine => ({
            id: i.id,
            name: i.item?.name ?? '—',
            code: i.item?.code,
            quantity: Number(i.quantity),
            rate: Number(i.unitPrice),
            tax: Number(i.tax),
            lineTotal: Number(i.lineTotal),
          }))}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  );
}
