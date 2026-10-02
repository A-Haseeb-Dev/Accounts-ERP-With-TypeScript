'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { apiFetch, qs } from '@/lib/api';
import { Field, Input } from '@/components/ui/field';
import { PageHeader } from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { ReportActions } from '@/components/report-actions';
import { ReportPrintHeader } from '@/components/report-print-header';
import { QueryError } from '@/components/query-error';
import { TableSkeleton } from '@/components/table-skeleton';
import { money } from '@/lib/utils';

type Row = {
  partyId: string;
  code: string;
  name: string;
  phone: string | null;
  creditDays: number | null;
  current: number;
  d30: number;
  d60: number;
  d90: number;
  d90plus: number;
  total: number;
  overdue: number;
  oldestDays: number;
};

const EMPTY_TOTALS = { current: 0, d30: 0, d60: 0, d90: 0, d90plus: 0, total: 0, overdue: 0 };
type Totals = typeof EMPTY_TOTALS;

type Ageing = {
  asOf: string;
  partyType: 'CUSTOMER' | 'SUPPLIER';
  rows: Row[];
  totals: Totals;
};

const BUCKETS = [
  { key: 'current', label: 'Not due', color: 'text-slate-700' },
  { key: 'd30', label: '1-30 days', color: 'text-amber-600' },
  { key: 'd60', label: '31-60 days', color: 'text-orange-600' },
  { key: 'd90', label: '61-90 days', color: 'text-red-600' },
  { key: 'd90plus', label: '90+ days', color: 'text-red-700' },
] as const;

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function PartyAgeingPage() {
  const [partyType, setPartyType] = useState<'CUSTOMER' | 'SUPPLIER'>('CUSTOMER');
  const [asOf, setAsOf] = useState(today());
  const [search, setSearch] = useState('');

  const { data, isLoading, isError, refetch } = useQuery<Ageing>({
    queryKey: ['party-ageing', partyType, asOf, search],
    queryFn: () =>
      apiFetch(
        '/reports/party-ageing' + qs({ partyType, asOf, search: search.trim() || undefined }),
      ),
  });

  const rows = data?.rows ?? [];
  const totals: Totals = data?.totals ?? EMPTY_TOTALS;
  const label = partyType === 'SUPPLIER' ? 'Supplier' : 'Customer';

  return (
    <div>
      <PageHeader
        title="Party Ageing"
        description={`Outstanding money by how late it is, as at a date. ${label} ageing starts from the due date when there is one, otherwise from the document date.`}
        actions={
          <ReportActions
            tableId="party-ageing"
            filename="party-ageing"
            title={`${label} Ageing as at ${asOf}`}
          />
        }
      />

      <Card>
        <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 px-4 py-3">
          <Field label="Party">
            <div className="flex rounded border border-slate-200">
              {(['CUSTOMER', 'SUPPLIER'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setPartyType(t)}
                  className={`px-3 py-2 text-xs font-medium ${partyType === t ? 'bg-slate-800 text-white' : 'text-slate-600'}`}
                >
                  {t === 'CUSTOMER' ? 'Customers' : 'Suppliers'}
                </button>
              ))}
            </div>
          </Field>
          <Field label="As at">
            <Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className="w-44" />
          </Field>
          <Field label="Search">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name contains..."
              className="w-56"
            />
          </Field>
        </div>

        {isError && (
          <div className="border-b border-slate-100 px-4 py-3">
            <QueryError onRetry={() => refetch()} />
          </div>
        )}

        <div id="party-ageing" className="overflow-x-auto">
          <ReportPrintHeader title={`${label} Ageing as at ${asOf}`} />

          {isLoading ? (
            <TableSkeleton rows={8} columns={9} />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                  <th className="px-4 py-2">Code</th>
                  <th className="px-4 py-2">{label}</th>
                  <th className="px-4 py-2">Phone</th>
                  {BUCKETS.map((b) => (
                    <th key={b.key} className="px-4 py-2 text-right">
                      {b.label}
                    </th>
                  ))}
                  <th className="px-4 py-2 text-right">Total</th>
                  <th className="px-4 py-2 text-right">Oldest</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.partyId} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-4 py-2 font-mono text-xs text-slate-500">{r.code}</td>
                    <td className="px-4 py-2 font-medium text-slate-800">{r.name}</td>
                    <td className="px-4 py-2 text-slate-600">{r.phone ?? ''}</td>
                    {BUCKETS.map((b) => (
                      <td key={b.key} className={`px-4 py-2 text-right tabular-nums ${r[b.key] ? b.color : 'text-slate-300'}`}>
                        {r[b.key] ? money(r[b.key]) : ''}
                      </td>
                    ))}
                    <td className="px-4 py-2 text-right font-bold tabular-nums text-slate-800">{money(r.total)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-500">{r.oldestDays}d</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                      Nothing outstanding.
                    </td>
                  </tr>
                )}
              </tbody>
              {rows.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
                    <td colSpan={3} className="px-4 py-2 text-xs uppercase text-slate-500">
                      Total
                    </td>
                    {BUCKETS.map((b) => (
                      <td key={b.key} className="px-4 py-2 text-right tabular-nums text-slate-700">
                        {money(totals[b.key] ?? 0)}
                      </td>
                    ))}
                    <td className="px-4 py-2 text-right tabular-nums text-slate-900">{money(totals.total ?? 0)}</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          )}
        </div>

        {rows.length > 0 && (
          <div className="border-t border-slate-100 px-4 py-2 text-sm text-slate-500">
            {rows.length} {label.toLowerCase()}(s) with an outstanding balance · overdue total {money(totals.overdue ?? 0)}
          </div>
        )}
      </Card>
    </div>
  );
}
