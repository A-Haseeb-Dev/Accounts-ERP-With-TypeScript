'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Eye } from 'lucide-react';
import { apiFetch, qs } from '@/lib/api';
import { Input } from '@/components/ui/field';
import { DataTable } from '@/components/data-table';
import { Modal } from '@/components/ui/modal';
import { PageHeader } from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { money } from '@/lib/utils';

type Row = Record<string, unknown>;

interface Entry {
  key: string;
  mainAccountId: string;
  accountName?: string;
  debit: number;
  credit: number;
  narration?: string;
}

export default function CashBookPage() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery<{ items: Row[]; total: number; totalRunning: number }>({
    queryKey: ['cashbook', page, from, to, search],
    queryFn: () => apiFetch('/vouchers/cash-book' + qs({ page, pageSize: 20, from: from || undefined, to: to || undefined, search: search || undefined })),
  });

  const voucherIdOf = (r: Row): string | null => {
    const v = (r.voucher as Row | null) ?? r;
    return v?.id ? String(v.id) : null;
  };

  const [detailId, setDetailId] = useState<string | null>(null);

  const { data: detail, isLoading: detailLoading } = useQuery<Row>({
    queryKey: ['voucher', detailId],
    queryFn: () => apiFetch(`/vouchers/${detailId}`),
    enabled: !!detailId,
  });

  return (
    <div>
      <PageHeader title="Cash Book" description="Chronological cash account activity and running balance." />

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3">
          <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="w-40" />
          <span className="text-sm text-slate-400">to</span>
          <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="w-40" />
          <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search voucher…" className="max-w-xs" />
        </div>

        <DataTable<Row>
          columns={[
            { key: 'date', header: 'Date', render: (r) => <span className="text-slate-600">{new Date(String(r.date ?? r.voucherDate)).toLocaleDateString('en-GB')}</span> },
            { key: 'voucher', header: 'Voucher', render: (r) => {
              const v = (r.voucher as Row | null) ?? r;
              return <span className="font-mono font-semibold text-slate-800">{String(v.number ?? '')}</span>;
            } },
            { key: 'reference', header: 'Reference', render: (r) => <span className="text-slate-600">{r.reference ? String(r.reference) : '—'}</span> },
            { key: 'description', header: 'Description', render: (r) => <span className="text-slate-600">{(r.description as string) ?? '—'}</span> },
            { key: 'debit', header: 'Receipts', align: 'right', render: (r) => <span className="tabular-nums text-teal-600">{r.debit ? money(r.debit, 'PKR') : ''}</span> },
            { key: 'credit', header: 'Payments', align: 'right', render: (r) => <span className="tabular-nums text-red-600">{r.credit ? money(r.credit, 'PKR') : ''}</span> },
            { key: 'runningBalance', header: 'Balance', align: 'right', render: (r) => <span className="font-medium tabular-nums text-slate-800">{money(r.runningBalance, 'PKR')}</span> },
            {
              key: 'actions', header: 'Actions',
              render: (r) => (
                <div className="flex items-center gap-0.5">
                  <button onClick={() => voucherIdOf(r) && setDetailId(voucherIdOf(r))} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-blue-700" title="View voucher"><Eye className="h-4 w-4" /></button>
                </div>
              ),
            },
          ]}
          data={data?.items ?? []}
          loading={isLoading}
          rowKey={(r) => String(r.id ?? JSON.stringify(r))}
          page={page}
          pageSize={20}
          total={data?.total}
          onPageChange={setPage}
        />

        <div className="flex justify-end border-t border-slate-100 px-4 py-3 text-sm">
          <span className="text-slate-500">Closing balance: </span>
          <span className="ml-1.5 font-semibold tabular-nums text-slate-800">{money(data?.totalRunning ?? 0, 'PKR')}</span>
        </div>
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
  detail: Row | null | undefined;
  onClose: () => void;
}) {
  const entries = (detail?.entries as unknown as (Entry & { mainAccount: { code: string; name: string } })[] | undefined) ?? [];
  const tDebit = entries.reduce((s, en) => s + (en.debit ?? 0), 0);
  const tCredit = entries.reduce((s, en) => s + (en.credit ?? 0), 0);

  return (
    <Modal open={open} onClose={onClose} title={`Voucher ${detail?.number ?? ''}`} size="lg">
      {loading || !detail ? null : (
        <div>
          <div className="mb-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <KV label="Date" value={new Date(String(detail.voucherDate)).toLocaleDateString('en-GB')} />
            <KV label="Type" value={String(detail.voucherType)} />
            <KV label="Reference" value={detail.reference ? String(detail.reference) : '—'} />
            <KV label="Status" value={String(detail.status)} />
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

          {!!detail.description && <p className="mt-3 text-xs text-slate-500">Description: {String(detail.description)}</p>}
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