'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { apiFetch, qs } from '@/lib/api';
import { Field, Input, Select } from '@/components/ui/field';
import { PageHeader } from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { ReportActions } from '@/components/report-actions';
import { ReportPrintHeader } from '@/components/report-print-header';
import { ColumnPicker, useReportColumns, type ColumnDef } from '@/components/report-columns';
import { QueryError } from '@/components/query-error';
import { TableSkeleton } from '@/components/table-skeleton';
import { money } from '@/lib/utils';
import type { CashBookAccount, CashBookReport } from '@/lib/types';

const COLUMNS: ColumnDef[] = [
  { key: 'date', header: 'Date' },
  { key: 'voucher', header: 'Voucher' },
  { key: 'type', header: 'Type' },
  { key: 'reference', header: 'Reference' },
  { key: 'description', header: 'Description' },
  { key: 'debit', header: 'Receipts' },
  { key: 'credit', header: 'Payments' },
  { key: 'balance', header: 'Balance' },
];

const MONEY_KEYS = ['debit', 'credit', 'balance'];

const TYPE_LABEL: Record<string, string> = { JOURNAL: 'Journal', CREDIT: 'Credit', DEBIT: 'Debit' };

/** Upper bound on rows the monthly view pulls; guards against a runaway period. */
const MONTH_VIEW_LIMIT = 20000;

export default function CashBookReportPage() {
  const cols = useReportColumns(COLUMNS, 'cash-book');
  const [view, setView] = useState<'chronological' | 'byMonth'>('chronological');
  const [accountId, setAccountId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  const { data: accounts } = useQuery<CashBookAccount[]>({
    queryKey: ['cash-book-accounts'],
    queryFn: () => apiFetch('/reports/cash-book-accounts'),
    staleTime: 5 * 60 * 1000,
  });

  const { data, isLoading, isError, refetch } = useQuery<CashBookReport>({
    queryKey: ['cash-book', accountId, from, to, page, view],
    queryFn: () =>
      apiFetch(
        '/reports/cash-book' +
          qs({
            accountId: accountId || undefined,
            from: from || undefined,
            to: to || undefined,
            // The monthly view aggregates and exports the rows it receives, so
            // it needs the whole period in one response — paginating it would
            // silently drop months from the groups while the footer totals
            // (which cover the full period) still showed the full amount.
            page: view === 'byMonth' ? 1 : page,
            pageSize: view === 'byMonth' ? MONTH_VIEW_LIMIT : 200,
          }),
      ),
  });

  const rows = data?.rows ?? [];
  const account = data?.account;

  const monthGroups = (() => {
    const map = new Map<string, { key: string; monthLabel: string; rows: typeof rows; debit: number; credit: number; opening: number; closing: number }>();
    for (const r of rows) {
      const d = new Date(r.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
      let g = map.get(key);
      if (!g) {
        // The running balance already includes this first row, so step it back
        // to get the balance the month opened with.
        g = {
          key,
          monthLabel: label,
          rows: [],
          debit: 0,
          credit: 0,
          opening: r.runningBalance - (r.debit - r.credit),
          closing: 0,
        };
        map.set(key, g);
      }
      g.rows.push(r);
      g.debit += r.debit;
      g.credit += r.credit;
      g.closing = r.runningBalance;
    }
    return [...map.values()];
  })();

  const totalPages = data?.totalPages ?? 1;
  const period = from ? ` (${from}${to ? ` to ${to}` : ''})` : '';
  const reportTitle = `${account ? account.code + ' · ' + account.name : 'Cash Book'}${period}`;

  return (
    <div>
      <PageHeader
        title="Cash Book"
        description="Cash / bank account movements with a running balance."
        actions={
          <ReportActions tableId="cb-report" filename="cash-book" title={reportTitle} printTitle={reportTitle} />
        }
      />

      <Card>
        <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 px-4 py-3">
          <Field label="View">
            <Select
              value={view}
              onChange={(e) => {
                setView(e.target.value as 'chronological' | 'byMonth');
                setPage(1);
              }}
              className="w-40"
            >
              <option value="chronological">Chronological</option>
              <option value="byMonth">By month</option>
            </Select>
          </Field>
          <Field label="Account">
            <Select
              value={accountId}
              onChange={(e) => {
                setAccountId(e.target.value);
                setPage(1);
              }}
              className="w-64"
            >
              <option value="">Cash account (default)</option>
              {(accounts ?? []).map((a) => (
                <option key={a.id} value={a.id}>{a.code} · {a.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="From"><Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="w-40" /></Field>
          <Field label="To"><Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="w-40" /></Field>
          {view === 'chronological' && (
            <div className="ml-auto">
              <ColumnPicker defs={COLUMNS} visible={cols.visible} onToggle={cols.toggle} />
            </div>
          )}
        </div>

        {isError && <div className="border-b border-slate-100 px-4 py-3"><QueryError onRetry={() => refetch()} /></div>}

        <div className="grid grid-cols-2 gap-3 border-b border-slate-100 px-4 py-3 sm:grid-cols-4">
          <SummaryTile label="Opening" value={`${money(data?.openingBalance ?? 0)} ${data?.openingBalanceType ?? ''}`} />
          <SummaryTile label="Receipts" value={money(data?.totalDebit ?? 0)} tone="credit" />
          <SummaryTile label="Payments" value={money(data?.totalCredit ?? 0)} tone="debit" />
          <SummaryTile label="Closing" value={`${money(data?.closingBalance ?? 0)} ${data?.closingBalanceType ?? ''}`} strong />
        </div>

        {view === 'byMonth' ? (
          <div id="cb-report" className="overflow-x-auto">
            <ReportPrintHeader title={`Cash Book — By Month`} />
            {isLoading ? (
              <TableSkeleton rows={6} columns={6} />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                    <th className="px-4 py-2">Month</th>
                    <th className="px-4 py-2">Entries</th>
                    <th className="px-4 py-2 text-right">Opening</th>
                    <th className="px-4 py-2 text-right">Receipts</th>
                    <th className="px-4 py-2 text-right">Payments</th>
                    <th className="px-4 py-2 text-right">Closing</th>
                  </tr>
                </thead>
                <tbody>
                  {monthGroups.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No entries found.</td></tr>
                  )}
                  {monthGroups.map((g) => (
                    <tr key={g.key} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-2 font-semibold text-slate-800">{g.monthLabel}</td>
                      <td className="px-4 py-2 text-slate-500">{g.rows.length}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-600">{money(g.opening)}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-teal-600">{money(g.debit)}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-red-600">{money(g.credit)}</td>
                      <td className="px-4 py-2 text-right tabular-nums font-medium text-slate-800">{money(g.closing)}</td>
                    </tr>
                  ))}
                </tbody>
                {monthGroups.length > 0 && (
                  <tfoot>
                    <tr className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-800">
                      <td colSpan={2} className="px-4 py-2 text-xs font-semibold uppercase text-slate-500">Total</td>
                      <td className="px-4 py-2 text-right tabular-nums">{money(data?.openingBalance ?? 0)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{money(data?.totalDebit ?? 0)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{money(data?.totalCredit ?? 0)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{money(data?.closingBalance ?? 0)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            )}
            {(data?.total ?? 0) > MONTH_VIEW_LIMIT && (
              <p className="mt-2 text-xs text-amber-700">
                Showing the first {MONTH_VIEW_LIMIT.toLocaleString()} of{' '}
                {(data?.total ?? 0).toLocaleString()} entries. Narrow the date range to see every month.
              </p>
            )}
          </div>
        ) : (
          <div id="cb-report" className="overflow-x-auto">
            <ReportPrintHeader title="Cash Book" />
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
                      {cols.isVisible('voucher') && <td className="px-4 py-2 font-mono font-semibold text-slate-800">{r.voucherNumber}</td>}
                      {cols.isVisible('type') && <td className="px-4 py-2 text-slate-600">{TYPE_LABEL[r.voucherType] ?? r.voucherType}</td>}
                      {cols.isVisible('reference') && <td className="px-4 py-2 text-slate-600">{r.reference || '—'}</td>}
                      {cols.isVisible('description') && <td className="px-4 py-2 text-slate-700">{r.description || r.narration || '—'}</td>}
                      {cols.isVisible('debit') && <td className="px-4 py-2 text-right tabular-nums text-teal-600">{r.debit ? money(r.debit) : ''}</td>}
                      {cols.isVisible('credit') && <td className="px-4 py-2 text-right tabular-nums text-red-600">{r.credit ? money(r.credit) : ''}</td>}
                      {cols.isVisible('balance') && (
                        <td className={`px-4 py-2 text-right tabular-nums font-medium ${r.balanceType === 'CR' ? 'text-red-600' : 'text-slate-800'}`}>
                          {money(Math.abs(r.runningBalance))} {r.balanceType ?? ''}
                        </td>
                      )}
                    </tr>
                  ))}
                  {rows.length === 0 && !isLoading && (
                    <tr><td colSpan={cols.defsFiltered.length} className="px-4 py-8 text-center text-slate-400">No entries found.</td></tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        )}

        {view === 'chronological' && data && data.total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-3 text-sm">
            <span className="text-slate-500">
              {data.total} entr{data.total === 1 ? 'y' : 'ies'} · page {data.page} of {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700 disabled:opacity-40 hover:bg-slate-50"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="rounded-lg border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700 disabled:opacity-40 hover:bg-slate-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  tone,
  strong,
}: {
  label: string;
  value: string;
  tone?: 'credit' | 'debit';
  strong?: boolean;
}) {
  const toneClass = tone === 'credit' ? 'text-teal-600' : tone === 'debit' ? 'text-red-600' : 'text-slate-800';
  return (
    <div className={`rounded-lg border px-3 py-2 ${strong ? 'border-slate-200 bg-slate-50' : 'border-slate-100'}`}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-0.5 tabular-nums ${strong ? 'text-sm font-semibold' : 'text-sm'} ${toneClass}`}>{value}</p>
    </div>
  );
}
