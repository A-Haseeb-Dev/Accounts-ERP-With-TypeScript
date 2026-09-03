'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { apiFetch, qs } from '@/lib/api';
import { useItemOptions, useFlatOptions } from '@/hooks/use-options';
import { Field, Input, Select } from '@/components/ui/field';
import { PageHeader } from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { ReportActions } from '@/components/report-actions';
import { QueryError } from '@/components/query-error';
import { money } from '@/lib/utils';

type Row = Record<string, unknown>;

export default function ProductLedgerPage() {
  const { options: itemOptions } = useItemOptions();
  const { options: locationOptions } = useFlatOptions('stock-locations');
  const [itemId, setItemId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const { data, isLoading, isError, refetch } = useQuery<{ rows: Row[]; total: number; item?: Row }>({
    queryKey: ['product-ledger', itemId, locationId, from, to],
    queryFn: () => apiFetch('/reports/product-ledger' + qs({ itemId, locationId: locationId || undefined, from: from || undefined, to: to || undefined, pageSize: 100 })),
    enabled: !!itemId,
  });

  return (
    <div>
      <PageHeader
        title="Product Ledger"
        description="Item-wise stock movement history."
        actions={
          itemId && (
            <ReportActions
              tableId="pl-report"
              filename="product-ledger"
              title={`Product Ledger — ${String((data?.item as Row)?.name ?? '')}`}
            />
          )
        }
      />

      <Card>
        <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 px-4 py-3">
          <Field label="Item" className="flex-1">
            <Select value={itemId} onChange={(e) => setItemId(e.target.value)} required>
              <option value="">Select item…</option>
              {itemOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </Field>
          <Field label="Location">
            <Select value={locationId} onChange={(e) => setLocationId(e.target.value)}>
              <option value="">All</option>
              {locationOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </Field>
          <Field label="From"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" /></Field>
          <Field label="To"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" /></Field>
        </div>

        {!itemId && (
          <div className="px-4 py-10 text-center text-sm text-slate-400">Select an item to view its ledger.</div>
        )}

        {itemId && (
          <>
            {isError && <div className="border-b border-slate-100 px-4 py-3"><QueryError onRetry={() => refetch()} /></div>}
            <div id="pl-report" className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                  <th className="px-4 py-2">Date</th>
                  <th className="px-4 py-2">Type</th>
                  <th className="px-4 py-2">Reference</th>
                  <th className="px-4 py-2 text-right">Qty In</th>
                  <th className="px-4 py-2 text-right">Qty Out</th>
                  <th className="px-4 py-2 text-right">Balance</th>
                  <th className="px-4 py-2 text-right">Value</th>
                </tr>
              </thead>
              <tbody>
                {(data?.rows ?? []).map((r, i) => {
                  const value = Number(r.balance ?? 0) * Number(r.unitCost ?? 0);
                  return (
                    <tr key={i} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                      <td className="px-4 py-2 text-slate-600">{r.date ? new Date(String(r.date)).toLocaleDateString('en-GB') : '—'}</td>
                      <td className="px-4 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${Number(r.stockIn) > 0 ? 'bg-teal-50 text-teal-700' : 'bg-red-50 text-red-700'}`}>
                          {String(r.transactionType ?? '')}
                        </span>
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-slate-600">{String(r.referenceType ?? '')} {r.referenceId ? `(${String(r.referenceId).slice(0, 8)})` : ''}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-teal-600">{Number(r.stockIn) ? String(r.stockIn) : ''}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-red-600">{Number(r.stockOut) ? String(r.stockOut) : ''}</td>
                      <td className="px-4 py-2 text-right tabular-nums font-medium text-slate-800">{String(r.balance ?? 0)}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-700">{money(value, 'PKR')}</td>
                    </tr>
                  );
                })}
                {(!data || data.rows.length === 0) && !isLoading && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">No movements found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          </>
        )}
      </Card>
    </div>
  );
}