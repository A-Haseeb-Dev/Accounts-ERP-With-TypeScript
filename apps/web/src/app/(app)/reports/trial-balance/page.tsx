'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { useFlatOptions } from '@/hooks/use-options';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';
import { PageHeader } from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { ReportActions } from '@/components/report-actions';
import { ReportPrintHeader } from '@/components/report-print-header';
import { ColumnPicker, useReportColumns, type ColumnDef } from '@/components/report-columns';
import { Badge } from '@/components/ui/badge';
import { QueryError } from '@/components/query-error';
import { TableSkeleton } from '@/components/table-skeleton';
import { money } from '@/lib/utils';
import type { TrialBalanceRow } from '@/lib/types';

const COLUMNS: ColumnDef[] = [
  { key: 'code', header: 'Code' },
  { key: 'account', header: 'Account' },
  { key: 'head', header: 'Head' },
  { key: 'debit', header: 'Debit' },
  { key: 'credit', header: 'Credit' },
  { key: 'net', header: 'Net' },
];

const ACCOUNT_TYPES = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'];

interface TBGroup {
  key: string;
  headName: string;
  subHeadName: string;
  rows: TrialBalanceRow[];
  debit: number;
  credit: number;
  net: number;
}

export default function TrialBalancePage() {
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10));
  const [mode, setMode] = useState<'list' | 'summary'>('list');
  const [headId, setHeadId] = useState('');
  const [type, setType] = useState('');
  const [subHeadId, setSubHeadId] = useState('');
  const cols = useReportColumns(COLUMNS, 'trial-balance');
  const visibleMoney = cols.defsFiltered.filter((c) => c.key !== 'code' && c.key !== 'account' && c.key !== 'head');
  const labelSpan = cols.defsFiltered.length - visibleMoney.length;

  const { options: headOptions, data: headData } = useFlatOptions('head-accounts');
  const { data: subHeadData } = useQuery<{ id: string; code: string; name: string; headAccountId: string }[]>({
    queryKey: ['flat', 'sub-heads'],
    queryFn: () => apiFetch('/sub-heads/flat'),
  });

  const subHeadOptions = (subHeadData ?? []).filter((s) => !headId || s.headAccountId === headId);

  const { data, isLoading, isError, refetch } = useQuery<{ rows: TrialBalanceRow[]; totalDebit: number; totalCredit: number; balanced: boolean }>({
    queryKey: ['trial-balance', asOf],
    queryFn: () => apiFetch('/reports/trial-balance' + (asOf ? `?asOf=${asOf}` : '')),
  });

  const allRows = data?.rows ?? [];
  const totalDebit = data?.totalDebit ?? 0;
  const totalCredit = data?.totalCredit ?? 0;

  const headName = headData.find((h) => h.id === headId)?.name;
  const subHeadName = subHeadData?.find((s) => s.id === subHeadId)?.name;

  const filtered = allRows.filter((r) =>
    (!headId || r.head === headName) &&
    (!type || r.accountType === type) &&
    (!subHeadId || r.subHead === subHeadName),
  );

  const groups: TBGroup[] = (() => {
    const map = new Map<string, TBGroup>();
    for (const r of filtered) {
      const key = r.subHead ?? '(Uncategorised)';
      let g = map.get(key);
      if (!g) {
        g = { key, headName: r.head ?? '', subHeadName: r.subHead ?? '', rows: [], debit: 0, credit: 0, net: 0 };
        map.set(key, g);
      }
      g.rows.push(r);
      g.debit += r.debit ?? 0;
      g.credit += r.credit ?? 0;
      g.net += (r.debit ?? 0) - (r.credit ?? 0);
    }
    return [...map.values()];
  })();

  const sumDebit = filtered.reduce((s, r) => s + (r.debit ?? 0), 0);
  const sumCredit = filtered.reduce((s, r) => s + (r.credit ?? 0), 0);

  return (
    <div>
      <PageHeader
        title="Trial Balance"
        description="All account balances as of a date, with head / sub-head categorization."
        actions={
          <ReportActions
            tableId="tb-report"
            filename="trial-balance"
            title={`Trial Balance — as of ${asOf}${headId ? ` · ${headName ?? ''}` : ''}`}
          />
        }
      />

      <Card>
        <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 px-4 py-3">
          <Field label="View">
            <Select value={mode} onChange={(e) => setMode(e.target.value as 'list' | 'summary')} className="w-40">
              <option value="list">List</option>
              <option value="summary">By sub-head</option>
            </Select>
          </Field>
          <Field label="As of date">
            <Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className="w-40" />
          </Field>
          {mode === 'summary' && (
            <>
              <Field label="Head" className="flex-1">
                <Select value={headId} onChange={(e) => { setHeadId(e.target.value); setSubHeadId(''); }}>
                  <option value="">All heads</option>
                  {headOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              </Field>
              <Field label="Account type">
                <Select value={type} onChange={(e) => setType(e.target.value)} className="w-40">
                  <option value="">All types</option>
                  {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </Select>
              </Field>
              <Field label="Sub-head" className="flex-1">
                <Select value={subHeadId} onChange={(e) => setSubHeadId(e.target.value)} disabled={subHeadOptions.length === 0}>
                  <option value="">All sub-heads</option>
                  {subHeadOptions.map((s) => (
                    <option key={s.id} value={s.id}>{s.code} · {s.name}</option>
                  ))}
                </Select>
              </Field>
            </>
          )}
          <Button variant="secondary" onClick={() => refetch()} disabled={isLoading}>Refresh</Button>
          {mode === 'list' && (
            <div className="ml-auto">
              <ColumnPicker defs={COLUMNS} visible={cols.visible} onToggle={cols.toggle} />
            </div>
          )}
        </div>

        {isError && <div className="border-b border-slate-100 px-4 py-3"><QueryError onRetry={() => refetch()} /></div>}

        {mode === 'summary' ? (
          <div id="tb-report" className="overflow-x-auto">
            <ReportPrintHeader title="Trial Balance Summary" />
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2 text-sm">
              <span className="text-slate-700">
                <span className="font-semibold text-slate-900">Trial Balance — By Sub-head</span>
                {headName && <span className="text-slate-500"> — {headName}</span>}
              </span>
              <span className="text-slate-500">As of {asOf} · {filtered.length} account(s)</span>
            </div>
            {isLoading ? (
              <TableSkeleton rows={7} columns={6} />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                    <th className="px-4 py-2">Code</th>
                    <th className="px-4 py-2">Account</th>
                    <th className="px-4 py-2">Type</th>
                    <th className="px-4 py-2 text-right">Debit</th>
                    <th className="px-4 py-2 text-right">Credit</th>
                    <th className="px-4 py-2 text-right">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No accounts match the selected filters.</td></tr>
                  )}
                  {groups.map((g) => (
                    <TBGroupRows key={g.key} group={g} />
                  ))}
                  <tr className="border-t-2 border-slate-300 bg-slate-100 font-semibold text-slate-900">
                    <td className="px-4 py-2" colSpan={3}>Total</td>
                    <td className="px-4 py-2 text-right tabular-nums">{money(sumDebit)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{money(sumCredit)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{money(sumDebit - sumCredit)}</td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>
        ) : (
        <div id="tb-report" className="overflow-x-auto">
          <ReportPrintHeader title="Trial Balance" />
          {isLoading ? (
            <TableSkeleton rows={7} columns={COLUMNS.length} />
          ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                {cols.defsFiltered.map((c) => (
                  <th key={c.key} className={`px-4 py-2 ${c.key === 'debit' || c.key === 'credit' || c.key === 'net' ? 'text-right' : ''}`}>{c.header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allRows.map((r) => {
                const net = (r.debit ?? 0) - (r.credit ?? 0);
                return (
                  <tr key={r.accountId ?? r.code} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    {cols.isVisible('code') && <td className="px-4 py-2 font-mono font-semibold text-slate-800">{r.code}</td>}
                    {cols.isVisible('account') && <td className="px-4 py-2 text-slate-700">{r.name}</td>}
                    {cols.isVisible('head') && <td className="px-4 py-2 text-xs text-slate-500">{r.head ?? r.subHead ?? ''}</td>}
                    {cols.isVisible('debit') && <td className="px-4 py-2 text-right tabular-nums text-slate-700">{r.debit ? money(r.debit) : ''}</td>}
                    {cols.isVisible('credit') && <td className="px-4 py-2 text-right tabular-nums text-slate-700">{r.credit ? money(r.credit) : ''}</td>}
                    {cols.isVisible('net') && <td className={`px-4 py-2 text-right tabular-nums font-medium ${net >= 0 ? 'text-teal-600' : 'text-red-600'}`}>{money(r.balance ?? net)}</td>}
                  </tr>
                );
              })}
              {(allRows.length === 0) && !isLoading && (
                <tr><td colSpan={cols.defsFiltered.length} className="px-4 py-8 text-center text-slate-400">No data.</td></tr>
              )}
            </tbody>
            {allRows.length > 0 && (
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-800">
                  <td colSpan={labelSpan} className="px-4 py-2 text-xs font-semibold uppercase text-slate-500">Totals</td>
                  {cols.isVisible('debit') && <td className="px-4 py-2 text-right tabular-nums">{money(totalDebit)}</td>}
                  {cols.isVisible('credit') && <td className="px-4 py-2 text-right tabular-nums">{money(totalCredit)}</td>}
                  {cols.isVisible('net') && <td className="px-4 py-2 text-right tabular-nums">{money(totalDebit - totalCredit)}</td>}
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

function TBGroupRows({ group }: { group: TBGroup }) {
  return (
    <>
      <tr className="border-b border-slate-200 bg-teal-50/60">
        <td className="px-4 py-1.5" colSpan={6}>
          <span className="text-xs font-bold uppercase tracking-wide text-teal-800">{group.subHeadName}</span>
          {group.headName && <span className="ml-2 text-xs text-slate-400">· {group.headName}</span>}
        </td>
      </tr>
      {group.rows.map((r) => (
        <tr key={r.accountId ?? r.code} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
          <td className="px-4 py-2 font-mono text-slate-600">{r.code}</td>
          <td className="px-4 py-2 font-medium text-slate-800">{r.name}</td>
          <td className="px-4 py-2"><Badge tone="slate">{r.accountType ?? ''}</Badge></td>
          <td className="px-4 py-2 text-right tabular-nums text-slate-700">{money(r.debit ?? 0)}</td>
          <td className="px-4 py-2 text-right tabular-nums text-slate-700">{money(r.credit ?? 0)}</td>
          <td className={`px-4 py-2 text-right tabular-nums font-medium ${(r.balance ?? (r.debit ?? 0) - (r.credit ?? 0)) >= 0 ? 'text-teal-600' : 'text-red-600'}`}>{money(r.balance ?? (r.debit ?? 0) - (r.credit ?? 0))}</td>
        </tr>
      ))}
      {group.rows.length >= 1 && (
        <tr className="border-b border-slate-200 bg-slate-50 text-[13px] font-semibold text-slate-700">
          <td className="px-4 py-1.5" colSpan={3}>Sub-total</td>
          <td className="px-4 py-1.5 text-right tabular-nums">{money(group.debit)}</td>
          <td className="px-4 py-1.5 text-right tabular-nums">{money(group.credit)}</td>
          <td className={`px-4 py-1.5 text-right tabular-nums ${group.net >= 0 ? 'text-teal-600' : 'text-red-600'}`}>{money(group.net)}</td>
        </tr>
      )}
    </>
  );
}