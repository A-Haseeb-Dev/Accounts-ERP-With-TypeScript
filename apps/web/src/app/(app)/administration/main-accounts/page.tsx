'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { apiFetch, qs } from '@/lib/api';
import { parseDeleteGuard } from '@/lib/delete-guard';
import { useFlatOptions } from '@/hooks/use-options';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';
import { DataTable } from '@/components/data-table';
import { Modal } from '@/components/ui/modal';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DeleteWarnDialog } from '@/components/delete-warn-dialog';
import { PageHeader } from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { StatusBadge, Badge } from '@/components/ui/badge';
import { dateTime, num } from '@/lib/utils';
import { nextMainAccountCode, typeForLetter } from '@/lib/accounts';
import { useAuth } from '@/context/auth-context';
import type { MainAccount, SubHead, Paginated } from '@/lib/types';

const ACCOUNT_TYPES = [
  { value: 'ASSET', label: 'Asset' },
  { value: 'LIABILITY', label: 'Liability' },
  { value: 'EQUITY', label: 'Equity' },
  { value: 'REVENUE', label: 'Revenue' },
  { value: 'EXPENSE', label: 'Expense' },
];

const headTypeFor = (sh: SubHead): string => typeForLetter(String(sh.headAccount?.code ?? sh.code ?? 'A')[0]);

export default function MainAccountsPage() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const canCreate = can('administration.main-accounts.create');
  const canUpdate = can('administration.main-accounts.update');
  const canDelete = can('administration.main-accounts.delete');
  const { options: subHeadOptions, data: subHeadData, isLoading: subHeadsLoading } = useFlatOptions<SubHead>('sub-heads');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<MainAccount | null>(null);
  const [form, setForm] = useState<Partial<MainAccount>>({});
  const [deleteTarget, setDeleteTarget] = useState<MainAccount | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [delWarn, setDelWarn] = useState<{ target: MainAccount; labels: string[] } | null>(null);
  const [error, setError] = useState('');

  const [view, setView] = useState<'list' | 'grouped'>('grouped');
  const [openHeads, setOpenHeads] = useState<Record<string, boolean>>({});

  interface AccountRecord extends MainAccount {
    subHead?: MainAccount['subHead'] & {
      id: string;
      code: string | null;
      name: string | null;
      headAccount?: { id: string; code: string | null; name: string | null };
    };
  }
  interface HeadBrief { id: string; code: string | null; name: string | null; }
  interface SubBrief { id: string; code: string | null; name: string | null; }
  interface GroupedHead {
    head: HeadBrief;
    subHeads: { sub: SubBrief; accounts: AccountRecord[] }[];
    total: number;
  }

  const { data: allAccounts } = useFlatOptions<AccountRecord>('main-accounts');

  const filteredAccounts = useMemo(() => {
    const s = search.trim().toLowerCase();
    const t = typeFilter;
    return (allAccounts ?? []).filter(
      (a) =>
        (!t || a.accountType === t) &&
        (!s || [a.code, a.name, a.subHead?.name, a.subHead?.headAccount?.name].some((v) => v?.toLowerCase().includes(s))),
    );
  }, [allAccounts, search, typeFilter]);

  const groupedHeads = useMemo<GroupedHead[]>(() => {
    const byHead = new Map<string, GroupedHead>();
    for (const a of filteredAccounts) {
      const h = a.subHead?.headAccount;
      const s = a.subHead;
      if (!h || !s) continue;
      let g = byHead.get(h.id);
      if (!g) {
        g = { head: { id: h.id, code: h.code ?? null, name: h.name ?? null }, subHeads: [], total: 0 };
        byHead.set(h.id, g);
      }
      let sg = g.subHeads.find((x) => x.sub.id === s.id);
      if (!sg) {
        sg = { sub: { id: s.id, code: s.code ?? null, name: s.name ?? null }, accounts: [] };
        g.subHeads.push(sg);
      }
      sg.accounts.push(a);
      g.total += 1;
    }
    const order = [...byHead.values()].sort((x, y) =>
      (x.head.code ?? '').localeCompare(y.head.code ?? '', undefined, { numeric: true }),
    );
    for (const g of order) {
      g.subHeads.sort((x, y) =>
        (x.sub.code ?? '').localeCompare(y.sub.code ?? '', undefined, { numeric: true }),
      );
      for (const sg of g.subHeads) {
        sg.accounts.sort((a, b) =>
          (a.code ?? '').localeCompare(b.code ?? '', undefined, { numeric: true }),
        );
      }
    }
    return order;
  }, [filteredAccounts]);

  const { data, isLoading } = useQuery<Paginated<MainAccount>>({
    queryKey: ['main-accounts', page, search, typeFilter],
    queryFn: () => apiFetch('/main-accounts' + qs({ page, pageSize: 20, search: search || undefined, accountType: typeFilter || undefined })),
  });

  const save = useMutation({
    mutationFn: (payload: Partial<MainAccount>) => {
      const merged: Partial<MainAccount> = { ...payload };
      if (!editing?.id) merged.code = generatedCode || payload.code;
      return editing?.id
        ? apiFetch(`/main-accounts/${editing.id}`, { method: 'PATCH', body: JSON.stringify(merged) })
        : apiFetch('/main-accounts', { method: 'POST', body: JSON.stringify(merged) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['main-accounts'] });
      qc.invalidateQueries({ queryKey: ['flat', 'main-accounts'] });
      setModalOpen(false);
      setEditing(null);
      setForm({});
    },
    onError: (e: Error) => setError(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => apiFetch(`/main-accounts/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['main-accounts'] });
      qc.invalidateQueries({ queryKey: ['flat', 'main-accounts'] });
      setDeleteTarget(null);
      setDeleteError('');
    },
    onError: (e: Error) => {
      const info = parseDeleteGuard(e);
      if (info && deleteTarget) {
        setDeleteTarget(null);
        setDeleteError('');
        setDelWarn({ target: deleteTarget, labels: info.labels });
      } else {
        setDeleteError(e.message);
      }
    },
  });

  const set = (name: keyof MainAccount | string, value: string | number | undefined) => setForm((f) => ({ ...f, [name]: value }));

  const selectedSubHead = subHeadData.find((s) => s.id === form.subHeadId);
  const accountCodesUnderSub = allAccounts
    .filter((a) => a.subHeadId === form.subHeadId)
    .map((a) => a.code ?? '');
  const generatedCode =
    editing || !selectedSubHead
      ? form.code ?? ''
      : nextMainAccountCode(selectedSubHead.code, accountCodesUnderSub);

  return (
    <div>
      <PageHeader
        title="Main Accounts"
        description="Leaf accounts in the chart of accounts where voucher entries are posted."
        actions={
          canCreate && (
            <Button onClick={() => { setEditing(null); setForm({ status: 'active', accountType: 'ASSET' }); setError(''); setModalOpen(true); }}>
              <Plus className="h-4 w-4" /> New Main Account
            </Button>
          )
        }
      />

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search…" className="pl-9" />
          </div>
          <Select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }} className="w-44">
            <option value="">All types</option>
            {ACCOUNT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </Select>
          <div className="ml-auto flex items-center rounded-lg border border-slate-200 p-0.5">
            <button
              onClick={() => setView('list')}
              className={`rounded-md px-3 py-1 text-xs font-medium ${view === 'list' ? 'bg-teal-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              List
            </button>
            <button
              onClick={() => setView('grouped')}
              className={`rounded-md px-3 py-1 text-xs font-medium ${view === 'grouped' ? 'bg-teal-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
            >
              Head → Sub head
            </button>
          </div>
        </div>
        {view === 'list' ? (
        <DataTable<MainAccount>
          columns={[
            { key: 'code', header: 'Code', render: (r) => <span className="font-mono font-semibold text-slate-800">{r.code}</span> },
            { key: 'name', header: 'Name', render: (r) => <span className="font-medium text-slate-800">{r.name}</span> },
            { key: 'accountType', header: 'Type', render: (r) => <Badge tone={typeTone(r.accountType ?? '')}>{r.accountType ?? ''}</Badge> },
            { key: 'subHead', header: 'Sub Head', render: (r) => <span className="text-slate-500">{r.subHead?.name ?? '-'}</span> },
            { key: 'openingBalance', header: 'Opening', align: 'right', render: (r) => <span className="text-slate-600">{num(r.openingBalance ?? 0)} <span className="text-[10px] font-medium uppercase text-slate-400">{r.openingBalanceType ?? 'DR'}</span></span> },
            { key: 'openingDate', header: 'Opening Date', render: (r) => <span className="text-slate-500">{r.openingDate ? new Date(r.openingDate).toLocaleDateString('en-GB') : '-'}</span> },
            { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
            { key: 'updatedAt', header: 'Updated', render: (r) => <span className="text-xs text-slate-400">{dateTime(r.updatedAt)}</span> },
            {
              key: 'actions', header: 'Actions',
              render: (r) => (
                <div className="flex items-center gap-1">
                  {canUpdate && <button onClick={() => { setEditing(r); setForm(r); setError(''); setModalOpen(true); }} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-teal-700"><Pencil className="h-4 w-4" /></button>}
                  {canDelete && <button onClick={() => setDeleteTarget(r)} className="rounded-lg p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>}
                </div>
              ),
            },
          ]}
          data={data?.items ?? []}
          loading={isLoading}
          rowKey={(r) => r.id}
          page={page}
          pageSize={20}
          total={data?.total}
          onPageChange={setPage}
        />
        ) : (
        <div className="divide-y divide-slate-100">
          {groupedHeads.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-slate-400">No main accounts match the selected filters.</div>
          ) : (
            groupedHeads.map((g) => {
              const isOpen = openHeads[g.head.id] ?? true;
              return (
                <div key={g.head.id}>
                  <div className="group flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50/70">
                    <button onClick={() => setOpenHeads((o) => ({ ...o, [g.head.id]: !isOpen }))} className="rounded-md p-1 text-slate-400 hover:bg-slate-100" aria-label="Expand / collapse">
                      {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                    <span className="font-mono text-sm font-semibold text-teal-700">{g.head.code}</span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{g.head.name}</span>
                    <Badge tone={typeTone(typeForLetter(String(g.head.code ?? 'A')[0]))}>{typeForLetter(String(g.head.code ?? 'A')[0])}</Badge>
                    <span className="text-xs text-slate-400">{g.total} account(s)</span>
                  </div>
                  {isOpen && (
                    <div className="border-l border-slate-100 bg-slate-50/40">
                      {g.subHeads.map((sg) => (
                        <div key={sg.sub.id}>
                          <div className="flex items-center gap-2 bg-slate-100/60 py-1.5 pl-12 pr-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                            <span className="font-mono text-slate-600">{sg.sub.code}</span>
                            <span>{sg.sub.name}</span>
                            <span className="ml-auto text-[10px] font-normal normal-case text-slate-400">{sg.accounts.length} account(s)</span>
                          </div>
                          <div className="border-b border-slate-100">
                            {sg.accounts.map((a) => (
                              <div key={a.id} className="group/acc flex items-center gap-3 py-1.5 pl-16 pr-4 hover:bg-slate-100/60">
                                <span className="w-28 shrink-0 font-mono text-xs text-slate-600">{a.code}</span>
                                <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{a.name}</span>
                                <span className="text-xs text-slate-400 tabular-nums">{num(a.openingBalance ?? 0)} <span className="text-[10px] font-medium uppercase">{a.openingBalanceType ?? 'DR'}</span></span>
                                <span className="w-20 shrink-0"><StatusBadge status={a.status} /></span>
                                <div className="flex items-center gap-1">
                                  {canUpdate && <button onClick={() => { setEditing(a); setForm(a); setError(''); setModalOpen(true); }} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-teal-700"><Pencil className="h-3.5 w-3.5" /></button>}
                                  {canDelete && <button onClick={() => setDeleteTarget(a)} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
        )}
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Edit Main Account' : 'New Main Account'}>
        <form
          onSubmit={(e) => { e.preventDefault(); setError(''); save.mutate(form); }}
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-4">
          <Field label="Code" required>
            <Input
              value={generatedCode}
              onChange={(e) => set('code', e.target.value)}
              placeholder="auto A1-001-0001"
              required
              disabled={!!selectedSubHead && !editing}
            />
            {!!selectedSubHead && !editing && (
              <p className="mt-1 text-[11px] text-slate-400">Auto-generated from the selected sub head. Clear the sub head to enter manually.</p>
            )}
          </Field>
            <Field label="Name" required>
              <Input value={form.name ?? ''} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Petty Cash" required />
            </Field>
          </div>
          <Field label="Sub Head" required>
            <Select value={form.subHeadId ?? ''} onChange={(e) => { set('subHeadId', e.target.value); const sh = subHeadData.find((s) => s.id === e.target.value); if (sh) set('accountType', headTypeFor(sh)); }} disabled={subHeadsLoading} required>
              <option value="">Select sub head…</option>
              {subHeadOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </Field>
          <Field label="Account Type" required hint="Auto-derived from the selected sub head's head account.">
            <Select value={form.accountType ?? 'ASSET'} onChange={(e) => set('accountType', e.target.value)}>
              {ACCOUNT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
          </Field>
          <div className="grid grid-cols-3 gap-4">
            <Field label="Opening Balance" hint="Posted as an opening entry in the ledger.">
              <Input type="number" step="0.01" value={form.openingBalance ?? 0} onChange={(e) => set('openingBalance', e.target.value === '' ? 0 : Number(e.target.value))} />
            </Field>
            <Field label="Opening Side">
              <Select value={form.openingBalanceType ?? 'DR'} onChange={(e) => set('openingBalanceType', e.target.value)} disabled={!(form.openingBalance && Number(form.openingBalance) > 0)}>
                <option value="DR">Debit (DR)</option>
                <option value="CR">Credit (CR)</option>
              </Select>
            </Field>
            <Field label="Opening Date">
              <Input type="date" value={form.openingDate ? String(form.openingDate).slice(0, 10) : ''} onChange={(e) => set('openingDate', e.target.value)} />
            </Field>
          </div>
          <Field label="Description">
            <Input value={form.description ?? ''} onChange={(e) => set('description', e.target.value)} />
          </Field>
          <Field label="Status">
            <Select value={form.status ?? 'active'} onChange={(e) => set('status', e.target.value)}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
          </Field>

          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit" loading={save.isPending}>{editing ? 'Save changes' : 'Create'}</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        danger
        title="Delete Main Account"
        message={`Delete "${deleteTarget?.name ?? ''}"? Accounts with posting activity cannot be deleted.`}
        confirmLabel="Delete"
        loading={del.isPending}
        onCancel={() => { setDeleteTarget(null); setDeleteError(''); }}
        onConfirm={() => { setDeleteError(''); deleteTarget?.id && del.mutate(deleteTarget.id); }}
      >
        {deleteError && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{deleteError}</div>
        )}
      </ConfirmDialog>

      <DeleteWarnDialog
        open={!!delWarn}
        recordName={delWarn?.target.name ?? ''}
        labels={delWarn?.labels ?? []}
        forceable={false}
        onClose={() => setDelWarn(null)}
        onForce={() => setDelWarn(null)}
      />
    </div>
  );
}

function typeTone(type: string): 'teal' | 'amber' | 'blue' | 'green' | 'red' {
  switch (type) {
    case 'ASSET': return 'teal';
    case 'LIABILITY': return 'amber';
    case 'EQUITY': return 'blue';
    case 'REVENUE': return 'green';
    default: return 'red';
  }
}