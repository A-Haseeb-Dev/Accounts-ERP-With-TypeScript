'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { apiFetch, qs } from '@/lib/api';
import { useAccountingAccounts, useFlatOptions } from '@/hooks/use-options';
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
import type { LedgerRow, MainAccount } from '@/lib/types';

const COLUMNS: ColumnDef[] = [
  { key: 'date', header: 'Date' },
  { key: 'voucher', header: 'Voucher' },
  { key: 'mainCode', header: 'Code' },
  { key: 'description', header: 'Description / Narration' },
  { key: 'debit', header: 'Debit' },
  { key: 'credit', header: 'Credit' },
  { key: 'balance', header: 'Balance' },
  { key: 'balanceType', header: 'Type' },
];

const ACCOUNT_TYPES = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'];

interface SubHeadFlat { id: string; code: string; name: string; headAccountId: string; }

interface LedgerSummaryRow {
  accountId: string;
  code: string;
  name: string;
  accountType: string;
  headId: string | null;
  headName: string;
  subHeadId: string | null;
  subHeadName: string;
  opening: number;
  debit: number;
  credit: number;
  closing: number;
  balanceType: 'DR' | 'CR' | null;
}

interface LedgerSummaryGroup {
  subHeadId: string | null;
  subHeadName: string;
  headName: string;
  headId: string | null;
  rows: LedgerSummaryRow[];
  opening: number;
  debit: number;
  credit: number;
  closing: number;
}

interface LedgerSummary {
  groups: LedgerSummaryGroup[];
  rows: LedgerSummaryRow[];
  totals: { opening: number; debit: number; credit: number; closing: number };
}

export default function GeneralLedgerPage() {
  const { options: accountOptions } = useAccountingAccounts();
  const { options: headOptions } = useFlatOptions('head-accounts');
  const { data: subHeadData } = useQuery<SubHeadFlat[]>({
    queryKey: ['flat', 'sub-heads'],
    queryFn: () => apiFetch('/sub-heads/flat'),
  });
  const cols = useReportColumns(COLUMNS, 'general-ledger');

  const [mode, setMode] = useState<'detail' | 'summary'>('detail');
  const [accountId, setAccountId] = useState('');
  const [headId, setHeadId] = useState('');
  const [type, setType] = useState('');
  const [subHeadId, setSubHeadId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  const subHeadOptions = (subHeadData ?? []).filter((s) => !headId || s.headAccountId === headId);

  const { data, isLoading, isError, refetch } = useQuery<{ rows: LedgerRow[]; total: number; openingBalance: number; openingBalanceType: string; closingBalance: number; closingBalanceType?: 'DR' | 'CR' | null; account?: MainAccount }>({
    queryKey: ['general-ledger', accountId, from, to, page],
    queryFn: () => apiFetch('/reports/general-ledger' + qs({ accountId, from: from || undefined, to: to || undefined, page, pageSize: 30 })),
    enabled: mode === 'detail' && !!accountId,
  });

  const { data: summary } = useQuery<LedgerSummary>({
    queryKey: ['general-ledger-summary', headId, subHeadId, type, from, to],
    queryFn: () => apiFetch('/reports/general-ledger-summary' + qs({ headId: headId || undefined, subHeadId: subHeadId || undefined, accountType: type || undefined, from: from || undefined, to: to || undefined })),
    enabled: mode === 'summary',
  });

  const modeLabel = mode === 'detail' ? 'General Ledger' : 'Ledger Summary';
  const hasQuery = mode === 'detail' ? !!accountId : mode === 'summary';

  return (
    <div>
      <PageHeader
        title="General Ledger"
        description="Account-wise posted voucher entries with running balance."
        actions={
          <ReportActions
            tableId="gl-report"
            filename={`${mode === 'detail' ? 'general-ledger' : 'ledger-summary'}`}
            title={`${modeLabel}${headId ? ` — ${headOptions.find((h) => h.value === headId)?.label ?? ''}` : ''} ${from ? `(${from} to ${to || from})` : ''}`}
            disabled={!hasQuery || isLoading}
          />
        }
      />

      <Card>
        <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 px-4 py-3">
          <Field label="View">
            <Select value={mode} onChange={(e) => { setMode(e.target.value as 'detail' | 'summary'); setPage(1); }} className="w-44">
              <option value="detail">Single account</option>
              <option value="summary">By head / sub-head</option>
            </Select>
          </Field>

          {mode === 'detail' ? (
            <Field label="Account" className="flex-1">
              <Select value={accountId} onChange={(e) => { setAccountId(e.target.value); setPage(1); }} required>
                <option value="">Select account…</option>
                {accountOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Select>
            </Field>
          ) : (
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

          <Field label="From"><Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="w-40" /></Field>
          <Field label="To"><Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="w-40" /></Field>
          <div className="ml-auto">
            <ColumnPicker defs={COLUMNS} visible={cols.visible} onToggle={cols.toggle} />
          </div>
        </div>

        {mode === 'detail' && !accountId && (
          <div className="px-4 py-10 text-center text-sm text-slate-400">Select an account to view its ledger.</div>
        )}

        {mode === 'detail' && accountId && (
          <>
            {isError && <div className="border-b border-slate-100 px-4 py-3"><QueryError onRetry={() => refetch()} /></div>}
            <div id="gl-report" className="overflow-x-auto">
            <ReportPrintHeader title="General Ledger" />
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2 text-sm">
              <span className="text-slate-700">
                <span className="font-semibold text-slate-900">General Ledger</span>
                {data?.account?.name && <span className="text-slate-500"> — {data.account.name}</span>}
              </span>
              <span className="text-slate-500">
                {from ? `Period: ${from}${to ? ` to ${to}` : ''}` : 'All dates'}
              </span>
            </div>
            <div className="flex flex-wrap justify-between gap-2 border-b border-slate-100 px-4 py-2 text-sm">
              <span className="text-slate-600">Opening balance: <span className="font-semibold text-slate-800">{money(Math.abs(data?.openingBalance ?? 0), 'PKR')} <Badge tone={data?.openingBalanceType === 'CR' ? 'amber' : 'teal'}>{data?.openingBalanceType ?? 'DR'}</Badge></span></span>
              <span className="text-slate-600">Closing balance: <span className="font-semibold text-slate-800">{money(Math.abs(data?.closingBalance ?? 0), 'PKR')} {data?.closingBalanceType && <Badge tone={data.closingBalanceType === 'CR' ? 'amber' : 'teal'}>{data.closingBalanceType}</Badge>}</span></span>
            </div>
            {isLoading ? (
              <TableSkeleton rows={6} columns={COLUMNS.length} />
            ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                  {cols.defsFiltered.map((c) => (
                    <th key={c.key} className={`px-4 py-2 ${c.key === 'debit' || c.key === 'credit' || c.key === 'balance' ? 'text-right' : ''}`}>{c.header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(data?.rows ?? []).map((r, i) => (
                  <tr key={r.id ?? i} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    {cols.isVisible('date') && <td className="px-4 py-2 text-slate-600">{r.date ? new Date(r.date).toLocaleDateString('en-GB') : '—'}</td>}
                    {cols.isVisible('voucher') && <td className="px-4 py-2 font-mono font-semibold text-slate-800">{r.voucherNumber ?? ''}</td>}
                    {cols.isVisible('mainCode') && <td className="px-4 py-2 font-mono text-slate-600">{r.mainCode ?? ''}</td>}
                    {cols.isVisible('description') && <td className="max-w-[300px] truncate px-4 py-2 text-slate-600">{r.description ?? ''}</td>}
                    {cols.isVisible('debit') && <td className="px-4 py-2 text-right tabular-nums text-teal-600">{r.debit ? money(r.debit, 'PKR') : ''}</td>}
                    {cols.isVisible('credit') && <td className="px-4 py-2 text-right tabular-nums text-red-600">{r.credit ? money(r.credit, 'PKR') : ''}</td>}
                    {cols.isVisible('balance') && <td className="px-4 py-2 text-right tabular-nums font-medium text-slate-800">{money(Math.abs(r.balance), 'PKR')}</td>}
                    {cols.isVisible('balanceType') && <td className="px-4 py-2 text-right"><Badge tone={r.balanceType === 'CR' ? 'amber' : 'teal'}>{r.balanceType ?? ''}</Badge></td>}
                  </tr>
                ))}
                {(!data || data.rows.length === 0) && !isLoading && (
                  <tr><td colSpan={cols.defsFiltered.length} className="px-4 py-8 text-center text-slate-400">No entries found.</td></tr>
                )}
              </tbody>
            </table>
            )}
          </div>
          </>
        )}

        {mode === 'summary' && summary && (
          <div id="gl-report" className="overflow-x-auto">
            <ReportPrintHeader title="Ledger Summary" />
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2 text-sm">
              <span className="text-slate-700">
                <span className="font-semibold text-slate-900">Ledger Summary</span>
                {headId && <span className="text-slate-500"> — {headOptions.find((h) => h.value === headId)?.label ?? ''}</span>}
              </span>
              <span className="text-slate-500">
                {from ? `Period: ${from}${to ? ` to ${to}` : ''}` : 'All dates'} · {summary.rows.length} account(s)
              </span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                  <th className="px-4 py-2">Code</th>
                  <th className="px-4 py-2">Account</th>
                  <th className="px-4 py-2">Type</th>
                  <th className="px-4 py-2 text-right">Opening</th>
                  <th className="px-4 py-2 text-right">Debit</th>
                  <th className="px-4 py-2 text-right">Credit</th>
                  <th className="px-4 py-2 text-right">Closing</th>
                  <th className="px-4 py-2 text-right">Side</th>
                </tr>
              </thead>
              <tbody>
                {summary.groups.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">No accounts match the selected filters.</td></tr>
                )}
                {summary.groups.map((g) => (
                  <GroupRows key={g.subHeadId ?? g.subHeadName} group={g} />
                ))}
                <tr className="border-t-2 border-slate-300 bg-slate-100 font-semibold text-slate-900">
                  <td className="px-4 py-2" colSpan={3}>Total</td>
                  <td className="px-4 py-2 text-right tabular-nums">{money(summary.totals.opening, 'PKR')}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-teal-700">{money(summary.totals.debit, 'PKR')}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-red-700">{money(summary.totals.credit, 'PKR')}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{money(summary.totals.closing, 'PKR')}</td>
                  <td className="px-4 py-2 text-right"><Badge tone={summary.totals.closing >= 0 ? 'teal' : 'amber'}>{summary.totals.closing >= 0 ? 'DR' : 'CR'}</Badge></td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function GroupRows({ group }: { group: LedgerSummaryGroup }) {
  return (
    <>
      <tr className="border-b border-slate-200 bg-teal-50/60">
        <td className="px-4 py-1.5" colSpan={8}>
          <span className="text-xs font-bold uppercase tracking-wide text-teal-800">{group.subHeadName}</span>
          {group.headName && <span className="ml-2 text-xs text-slate-400">· {group.headName}</span>}
        </td>
      </tr>
      {group.rows.map((r) => (
        <tr key={r.accountId} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
          <td className="px-4 py-2 font-mono text-slate-600">{r.code}</td>
          <td className="px-4 py-2 font-medium text-slate-800">{r.name}</td>
          <td className="px-4 py-2"><Badge tone="slate">{r.accountType}</Badge></td>
          <td className="px-4 py-2 text-right tabular-nums text-slate-600">{money(r.opening, 'PKR')}</td>
          <td className="px-4 py-2 text-right tabular-nums text-teal-700">{money(r.debit, 'PKR')}</td>
          <td className="px-4 py-2 text-right tabular-nums text-red-700">{money(r.credit, 'PKR')}</td>
          <td className="px-4 py-2 text-right tabular-nums font-medium text-slate-900">{money(r.closing, 'PKR')}</td>
          <td className="px-4 py-2 text-right"><Badge tone={r.balanceType === 'CR' ? 'amber' : 'teal'}>{r.balanceType ?? ''}</Badge></td>
        </tr>
      ))}
      {group.rows.length > 1 && (
        <tr className="border-b border-slate-200 bg-slate-50 text-[13px] font-semibold text-slate-700">
          <td className="px-4 py-1.5" colSpan={3}>Sub-total</td>
          <td className="px-4 py-1.5 text-right tabular-nums">{money(group.opening, 'PKR')}</td>
          <td className="px-4 py-1.5 text-right tabular-nums text-teal-700">{money(group.debit, 'PKR')}</td>
          <td className="px-4 py-1.5 text-right tabular-nums text-red-700">{money(group.credit, 'PKR')}</td>
          <td className="px-4 py-1.5 text-right tabular-nums">{money(group.closing, 'PKR')}</td>
          <td className="px-4 py-1.5 text-right"><Badge tone={group.closing >= 0 ? 'teal' : 'amber'}>{group.closing >= 0 ? 'DR' : 'CR'}</Badge></td>
        </tr>
      )}
    </>
  );
}