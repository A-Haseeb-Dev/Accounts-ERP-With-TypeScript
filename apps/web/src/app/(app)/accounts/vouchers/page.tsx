'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { CheckCircle2, Eye, Pencil, Plus, Search, Trash2, XCircle } from 'lucide-react';
import { apiFetch, qs } from '@/lib/api';
import { useAccountingAccounts } from '@/hooks/use-options';
import { useDocumentMutations } from '@/hooks/use-document-mutations';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { DataTable } from '@/components/data-table';
import { Modal } from '@/components/ui/modal';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { PageHeader } from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { dateTime, money } from '@/lib/utils';

type Row = Record<string, unknown>;

interface Entry {
  key: string;
  mainAccountId: string;
  accountName?: string;
  debit: number;
  credit: number;
  narration?: string;
}

export default function VouchersPage() {
  const qc = useQueryClient();
  const { options: accountOptions } = useAccountingAccounts();
  const { post, cancel } = useDocumentMutations('vouchers', 'vouchers');

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [voucherType, setVoucherType] = useState('');
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [date, setDate] = useState('');
  const [type, setType] = useState<'JOURNAL' | 'CREDIT' | 'DEBIT'>('JOURNAL');
  const [reference, setReference] = useState('');
  const [description, setDescription] = useState('');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [error, setError] = useState('');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Row | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Row | null>(null);
  const [deleteError, setDeleteError] = useState('');

  const { data, isLoading } = useQuery<{ items: Row[]; total: number }>({
    queryKey: ['vouchers', page, search, status, voucherType],
    queryFn: () => apiFetch('/vouchers' + qs({ page, pageSize: 20, search: search || undefined, status: status || undefined, voucherType: voucherType || undefined })),
  });

  const { data: detail, isLoading: detailLoading } = useQuery<Row>({
    queryKey: ['voucher', detailId],
    queryFn: () => apiFetch(`/vouchers/${detailId}`),
    enabled: !!detailId,
  });

  const create = useMutation({
    mutationFn: (payload: unknown) => apiFetch('/vouchers', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vouchers'] });
      setModalOpen(false);
      setEntries([]);
      setDescription('');
      setReference('');
    },
    onError: (e: Error) => setError(e.message),
  });

  const update = useMutation({
    mutationFn: (payload: unknown) => apiFetch(`/vouchers/${editId}`, { method: 'PATCH', body: JSON.stringify(payload) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vouchers'] });
      setModalOpen(false);
      setEditId(null);
      setEntries([]);
      setDescription('');
      setReference('');
    },
    onError: (e: Error) => setError(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`/vouchers/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vouchers'] });
      setDeleteTarget(null);
      setDeleteError('');
    },
    onError: (e: Error) => setDeleteError(e.message),
  });

  const openEdit = (r: Row) => {
    setDeleteError('');
    setEditId(String(r.id));
    setDate(String(r.voucherDate).slice(0, 10));
    setType(String(r.voucherType) as 'JOURNAL' | 'CREDIT' | 'DEBIT');
    setReference(String(r.reference ?? ''));
    setDescription(String(r.description ?? ''));
    setEntries(
      ((r.entries as unknown as Entry[]) ?? []).map((en) => ({
        key: crypto.randomUUID?.() ?? String(Date.now()) + Math.random(),
        mainAccountId: en.mainAccountId,
        debit: en.debit ?? 0,
        credit: en.credit ?? 0,
        narration: en.narration ?? '',
      })),
    );
    setError('');
    setModalOpen(true);
  };

  const totalDebit = entries.reduce((s, e) => s + e.debit, 0);
  const totalCredit = entries.reduce((s, e) => s + e.credit, 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.01;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (entries.length < 2) {
      setError('A voucher needs at least two entries (one debit, one credit).');
      return;
    }
    if (!balanced) {
      setError(`Entries don't balance: debit ${money(totalDebit, 'PKR')} vs credit ${money(totalCredit, 'PKR')}.`);
      return;
    }
    const payload = {
      voucherType: type,
      voucherDate: date,
      reference: reference || undefined,
      description: description || undefined,
      entries: entries
        .filter((en) => en.mainAccountId)
        .map((en) => ({
          mainAccountId: en.mainAccountId,
          debit: en.debit || undefined,
          credit: en.credit || undefined,
          narration: en.narration || undefined,
        })),
    };
    if (editId) update.mutate(payload);
    else create.mutate(payload);
  };

  const addEntry = () => setEntries((es) => [...es, { key: crypto.randomUUID?.() ?? String(Date.now()), mainAccountId: '', debit: 0, credit: 0 }]);
  const updateEntry = (key: string, patch: Partial<Entry>) => setEntries((es) => es.map((en) => (en.key === key ? { ...en, ...patch } : en)));
  const removeEntry = (key: string) => setEntries((es) => es.filter((en) => en.key !== key));

  const detailEntries = (detail?.entries as unknown as (Entry & { mainAccount: { code: string; name: string } })[] | undefined) ?? [];

  return (
    <div>
      <PageHeader
        title="Vouchers"
        description="Double-entry journals for manual and recurring accounting entries."
        actions={
          <Button onClick={() => { setDate(new Date().toISOString().slice(0, 10)); setType('JOURNAL'); setReference(''); setDescription(''); setEntries([]); setEditId(null); setError(''); setModalOpen(true); }}>
            <Plus className="h-4 w-4" /> New Voucher
          </Button>
        }
      />

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3">
          <div className="relative max-w-xs flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search number / reference…" className="pl-9" />
          </div>
          <Select value={voucherType} onChange={(e) => { setVoucherType(e.target.value); setPage(1); }} className="w-40">
            <option value="">All types</option>
            <option value="JOURNAL">Journal</option>
            <option value="CREDIT">Credit Note</option>
            <option value="DEBIT">Debit Note</option>
          </Select>
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="w-40">
            <option value="">All status</option>
            <option value="draft">Draft</option>
            <option value="posted">Posted</option>
            <option value="cancelled">Cancelled</option>
          </Select>
        </div>

        <DataTable<Row>
          columns={[
            { key: 'number', header: 'Number', render: (r) => <span className="font-mono font-semibold text-slate-800">{String(r.number)}</span> },
            { key: 'voucherDate', header: 'Date', render: (r) => <span className="text-slate-600">{new Date(String(r.voucherDate)).toLocaleDateString('en-GB')}</span> },
            { key: 'voucherType', header: 'Type', render: (r) => <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{String(r.voucherType)}</span> },
            { key: 'reference', header: 'Reference', render: (r) => <span className="text-slate-600">{r.reference ? String(r.reference) : '—'}</span> },
            { key: 'entries', header: 'Entries', align: 'right', render: (r) => <span className="text-slate-600">{(r.entries as unknown[])?.length ?? 0}</span> },
            { key: 'status', header: 'Status', render: (r) => <StatusBadge status={String(r.status)} /> },
            { key: 'createdAt', header: 'Created', render: (r) => <span className="text-xs text-slate-400">{dateTime(r.createdAt)}</span> },
            {
              key: 'actions', header: 'Actions',
              render: (r) => (
                <div className="flex items-center gap-0.5">
                  <button onClick={() => setDetailId(String(r.id))} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-blue-700" title="View"><Eye className="h-4 w-4" /></button>
                  {String(r.status) === 'draft' && (
                    <>
                      <button onClick={() => openEdit(r)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-blue-700" title="Edit"><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => { setDeleteTarget(r); setDeleteError(''); }} className="rounded-lg p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600" title="Delete"><Trash2 className="h-4 w-4" /></button>
                      <button onClick={() => post.mutate(String(r.id))} className="rounded-lg p-1.5 text-slate-500 hover:bg-teal-50 hover:text-teal-700" title="Post"><CheckCircle2 className="h-4 w-4" /></button>
                      <button onClick={() => { setCancelTarget(r); setCancelReason(''); }} className="rounded-lg p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600" title="Cancel"><XCircle className="h-4 w-4" /></button>
                    </>
                  )}
                </div>
              ),
            },
          ]}
          data={data?.items ?? []}
          loading={isLoading}
          rowKey={(r) => String(r.id)}
          page={page}
          pageSize={20}
          total={data?.total}
          onPageChange={setPage}
        />
      </Card>

      <Modal open={modalOpen} onClose={() => { setModalOpen(false); setEditId(null); }} title={editId ? 'Edit Voucher' : 'New Voucher'} size="lg">
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Field label="Voucher Date" required>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </Field>
            <Field label="Type" required>
              <Select value={type} onChange={(e) => setType(e.target.value as 'JOURNAL' | 'CREDIT' | 'DEBIT')}>
                <option value="JOURNAL">Journal</option>
                <option value="CREDIT">Credit Note</option>
                <option value="DEBIT">Debit Note</option>
              </Select>
            </Field>
            <div className="col-span-2">
              <Field label="Reference">
                <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="optional" />
              </Field>
            </div>
          </div>
          <Field label="Description"><Textarea value={description} onChange={(e) => setDescription(e.target.value)} /></Field>

          <div>
            <p className="mb-1.5 text-sm font-medium text-slate-700">Accounting Entries</p>
            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                    <th className="px-3 py-2">Account</th>
                    <th className="w-32 px-3 py-2 text-right">Debit</th>
                    <th className="w-32 px-3 py-2 text-right">Credit</th>
                    <th className="px-3 py-2">Narration</th>
                    <th className="w-10 px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((en) => (
                    <tr key={en.key} className="border-b border-slate-100 last:border-0">
                      <td className="px-3 py-1.5">
                        <Select value={en.mainAccountId} onChange={(e) => {
                          const opt = accountOptions.find((o) => o.value === e.target.value);
                          updateEntry(en.key, { mainAccountId: e.target.value, accountName: opt?.label });
                        }} className="min-w-[160px]">
                          <option value="">Select account…</option>
                          {accountOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </Select>
                      </td>
                      <td className="px-3 py-1.5">
                        <Input type="number" min={0} step="0.01" value={en.debit ? String(en.debit) : ''} onChange={(e) => updateEntry(en.key, { debit: Number(e.target.value) || 0, credit: 0 })} className="text-right" placeholder="0" />
                      </td>
                      <td className="px-3 py-1.5">
                        <Input type="number" min={0} step="0.01" value={en.credit ? String(en.credit) : ''} onChange={(e) => updateEntry(en.key, { credit: Number(e.target.value) || 0, debit: 0 })} className="text-right" placeholder="0" />
                      </td>
                      <td className="px-3 py-1.5">
                        <Input value={en.narration ?? ''} onChange={(e) => updateEntry(en.key, { narration: e.target.value })} placeholder="optional" />
                      </td>
                      <td className="px-3 py-1.5 text-center">
                        <button onClick={() => removeEntry(en.key)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                      </td>
                    </tr>
                  ))}
                  {entries.length === 0 && (
                    <tr><td colSpan={5} className="px-3 py-6 text-center text-sm text-slate-400">Add at least two entries (one debit, one credit).</td></tr>
                  )}
                </tbody>
                <tfoot>
                  <tr className="border-t border-slate-200 bg-slate-50 font-medium text-slate-800">
                    <td className="px-3 py-2 text-xs font-semibold uppercase text-slate-500">Totals</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(totalDebit, 'PKR')}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(totalCredit, 'PKR')}</td>
                    <td className="px-3 py-2 text-right text-xs" colSpan={2}>
                      <span className={balanced ? 'font-medium text-teal-600' : 'font-semibold text-red-600'}>
                        {balanced ? 'Balanced' : `Off by ${money(Math.abs(totalDebit - totalCredit), 'PKR')}`}
                      </span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <Button type="button" variant="secondary" size="sm" onClick={addEntry} className="mt-2"><Plus className="h-4 w-4" /> Add entry</Button>
          </div>

          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => { setModalOpen(false); setEditId(null); }}>Cancel</Button>
            <Button type="submit" loading={editId ? update.isPending : create.isPending} disabled={!balanced}>{editId ? 'Save changes' : 'Create'}</Button>
          </div>
        </form>
      </Modal>

      <VoucherDetailModal open={!!detailId} loading={detailLoading} detail={detail} onClose={() => setDetailId(null)} />

      <ConfirmDialog
        open={!!cancelTarget}
        danger
        title="Cancel Voucher"
        message="Cancelling a posted voucher requires a reversing entry. This action cannot be undone."
        confirmLabel="Cancel voucher"
        loading={cancel.isPending}
        onCancel={() => setCancelTarget(null)}
        onConfirm={() => cancelTarget?.id && cancel.mutate({ id: String(cancelTarget.id), reason: cancelReason || 'Cancelled from UI' })}
      >
        <div className="mt-3">
          <Field label="Reason">
            <Textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} placeholder="Optional reason" />
          </Field>
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={!!deleteTarget}
        danger
        title="Delete Voucher"
        message={`Delete voucher "${String(deleteTarget?.number ?? '')}"? This permanently removes the draft and its entries and cannot be undone.`}
        confirmLabel="Delete voucher"
        loading={remove.isPending}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget?.id && remove.mutate(String(deleteTarget.id))}
      >
        {deleteError && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{deleteError}</div>}
      </ConfirmDialog>
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