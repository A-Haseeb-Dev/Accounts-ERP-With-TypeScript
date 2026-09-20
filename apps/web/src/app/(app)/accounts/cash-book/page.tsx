'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Eye } from 'lucide-react';
import { apiFetch, qs } from '@/lib/api';
import { Field, Input, Select } from '@/components/ui/field';
import { DataTable } from '@/components/data-table';
import { Modal } from '@/components/ui/modal';
import { PageHeader } from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { money } from '@/lib/utils';
import type { CashBookRow, Paginated, Voucher, VoucherEntry } from '@/lib/types';

interface CashBookGroup {
  month: string;
  monthLabel: string;
  rows: CashBookRow[];
  opening: number;
  debit: number;
  credit: number;
  closing: number;
}

export default function CashBookPage() {
  const [mode, setMode] = useState<'chronological' | 'byMonth'>('chronological');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery<Paginated<CashBookRow> & { totalRunning?: number }>({
    queryKey: ['cashbook', mode, page, from, to, search],
    queryFn: () => apiFetch('/vouchers/cash-book' + qs({ page, pageSize: mode === 'byMonth' ? 10000 : 20, from: from || undefined, to: to || undefined, search: search || undefined })),
  });

  const groups: CashBookGroup[] = (() => {
    if (mode !== 'byMonth' || !data?.items?.length) return [];
    let running = 0;
    let lastMonth = '';
    let current: CashBookGroup | null = null;
    let first = true;
    const out: CashBookGroup[] = [];
    for (const r of data.items) {
      running = first ? (Number(r.runningBalance ?? 0) - (Number(r.debit ?? 0) - Number(r.credit ?? 0))) : running;
      first = false;
      running += Number(r.debit ?? 0) - Number(r.credit ?? 0);
      const d = new Date(r.date ?? r.voucherDate);
      const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const monthLabel = d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
      if (month !== lastMonth) {
        if (current) out.push(current);
        current = { month, monthLabel, rows: [], opening: running - (Number(r.debit ?? 0) - Number(r.credit ?? 0)), debit: 0, credit: 0, closing: 0 };
        lastMonth = month;
      }
      if (!current) continue;
      current.rows.push(r);
      current.debit += Number(r.debit ?? 0);
      current.credit += Number(r.credit ?? 0);
      current.closing = running;
    }
    if (current) out.push(current);
    return out;
  })();

  const voucherIdOf = (r: CashBookRow): string | null => {
    const v = r.voucher ?? r;
    return v.id ?? null;
  };

  const [detailId, setDetailId] = useState<string | null>(null);

  const { data: detail, isLoading: detailLoading } = useQuery<Voucher | null>({
    queryKey: ['voucher', detailId],
    queryFn: () => apiFetch(`/vouchers/${detailId}`),
    enabled: !!detailId,
  });

  return (
    <div>
      <PageHeader title="Cash Book" description="Chronological cash account activity and running balance." />

      <Card>
        <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 px-4 py-3">
          <Field label="View">
            <Select value={mode} onChange={(e) => { setMode(e.target.value as 'chronological' | 'byMonth'); setPage(1); }} className="w-40">
              <option value="chronological">Chronological</option>
              <option value="byMonth">By month</option>
            </Select>
          </Field>
          <Field label="From"><Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="w-40" /></Field>
          <Field label="To"><Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="w-40" /></Field>
          <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search voucher…" className="max-w-xs" />
        </div>

        {mode === 'byMonth' ? (
          <div id="cashbook-report" className="overflow-x-auto">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2 text-sm">
              <span className="font-semibold text-slate-800">Cash Book — Monthly Summary</span>
              <span className="text-slate-500">{from ? `Period: ${from}${to ? ` to ${to}` : ''}` : 'All dates'}</span>
            </div>
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
                {groups.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No entries found.</td></tr>
                )}
                {groups.map((g) => (
                  <tr key={g.month} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-2 font-semibold text-slate-800">{g.monthLabel}</td>
                    <td className="px-4 py-2 text-slate-500">{g.rows.length}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-600">{money(g.opening, 'PKR')}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-teal-600">{money(g.debit, 'PKR')}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-red-600">{money(g.credit, 'PKR')}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium text-slate-800">{money(g.closing, 'PKR')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {groups.length > 0 && (
              <div className="flex justify-end border-t border-slate-100 px-4 py-3 text-sm">
                <span className="text-slate-500">Closing balance: </span>
                <span className="ml-1.5 font-semibold tabular-nums text-slate-800">{money(groups[groups.length - 1].closing, 'PKR')}</span>
              </div>
            )}
          </div>
        ) : (
          <>
        <DataTable<CashBookRow>
          columns={[
            { key: 'date', header: 'Date', render: (r) => <span className="text-slate-600">{new Date(r.date ?? r.voucherDate).toLocaleDateString('en-GB')}</span> },
            { key: 'voucher', header: 'Voucher', render: (r) => {
              return <span className="font-mono font-semibold text-slate-800">{r.voucher?.number ?? ''}</span>;
            } },
            { key: 'reference', header: 'Reference', render: (r) => <span className="text-slate-600">{r.reference ?? '—'}</span> },
            { key: 'description', header: 'Description', render: (r) => <span className="text-slate-600">{r.description ?? '—'}</span> },
            { key: 'debit', header: 'Receipts', align: 'right', render: (r) => <span className="tabular-nums text-teal-600">{r.debit ? money(r.debit, 'PKR') : ''}</span> },
            { key: 'credit', header: 'Payments', align: 'right', render: (r) => <span className="tabular-nums text-red-600">{r.credit ? money(r.credit, 'PKR') : ''}</span> },
            { key: 'runningBalance', header: 'Balance', align: 'right', render: (r) => <span className="font-medium tabular-nums text-slate-800">{money(r.runningBalance, 'PKR')}</span> },
            {
              key: 'actions', header: 'Actions',
              render: (r) => (
                <div className="flex items-center gap-0.5">
                  <button onClick={() => { const id = voucherIdOf(r); if (id) setDetailId(id); }} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-blue-700" title="View voucher"><Eye className="h-4 w-4" /></button>
                </div>
              ),
            },
          ]}
          data={data?.items ?? []}
          loading={isLoading}
          rowKey={(r) => r.id ?? JSON.stringify(r)}
          page={page}
          pageSize={20}
          total={data?.total}
          onPageChange={setPage}
        />

        <div className="flex justify-end border-t border-slate-100 px-4 py-3 text-sm">
          <span className="text-slate-500">Closing balance: </span>
          <span className="ml-1.5 font-semibold tabular-nums text-slate-800">{money(data?.totalRunning ?? 0, 'PKR')}</span>
        </div>
        </>
        )}
      </Card>

      <VoucherDetailModal open={!!detailId} loading={detailLoading} detail={detail} onClose={() => setDetailId(null)} />
    </div>
  );
}

function VoucherDetailModal({
  open,
  loading,
  detail,
  onClose,
}: {
  open: boolean;
  loading: boolean;
  detail: Voucher | null | undefined;
  onClose: () => void;
}) {
  const entries: VoucherEntry[] = detail?.entries ?? [];
  const tDebit = entries.reduce((s, en) => s + Number(en.debit ?? 0), 0);
  const tCredit = entries.reduce((s, en) => s + Number(en.credit ?? 0), 0);

  return (
    <Modal open={open} onClose={onClose} title={`Voucher ${detail?.number ?? ''}`} size="lg">
      {loading || !detail ? null : (
        <div>
          <div className="mb-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <KV label="Date" value={new Date(detail.voucherDate).toLocaleDateString('en-GB')} />
            <KV label="Type" value={detail.voucherType} />
            <KV label="Reference" value={detail.reference ?? '—'} />
            <KV label="Status" value={detail.status} />
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                  <th className="px-3 py-2">Account</th>
                  <th className="px-3 py-2 text-right">Debit</th>
                  <th className="px-3 py-2 text-right">Credit</th>
                  <th className="px-3 py-2">Narration</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((en, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    <td className="px-3 py-2 text-slate-800">{en.mainAccount?.name ?? '-'} <span className="text-xs text-slate-400">({en.mainAccount?.code})</span></td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-700">{en.debit ? money(en.debit, 'PKR') : ''}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-700">{en.credit ? money(en.credit, 'PKR') : ''}</td>
                    <td className="px-3 py-2 text-sm text-slate-500">{en.narration ?? ''}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-800">
                  <td className="px-3 py-2 text-xs font-semibold uppercase text-slate-500">Totals</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(tDebit, 'PKR')}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(tCredit, 'PKR')}</td>
                  <td className="px-3 py-2"></td>
                </tr>
              </tfoot>
            </table>
          </div>

          {!!detail.description && <p className="mt-3 text-xs text-slate-500">Description: {detail.description}</p>}
        </div>
      )}
    </Modal>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-slate-800">{value}</p>
    </div>
  );
}