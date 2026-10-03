'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Landmark, Pencil, Plus, Trash2 } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { parseDeleteGuard, deleteErrorMessage } from '@/lib/delete-guard';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';
import { Modal } from '@/components/ui/modal';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DeleteWarnDialog } from '@/components/delete-warn-dialog';
import { PageHeader } from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { useFlatOptions } from '@/hooks/use-options';
import { useNextAccountCode } from '@/hooks/use-next-account-code';
import { AutoCodeField } from '@/components/auto-code-field';
import { useAuth } from '@/context/auth-context';
import type { HeadAccount, SubHead } from '@/lib/types';

type Head = HeadAccount;

const ACCOUNT_TYPES = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'] as const;
type AccountType = (typeof ACCOUNT_TYPES)[number];

const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  ASSET: 'Asset',
  LIABILITY: 'Liability',
  EQUITY: 'Equity',
  REVENUE: 'Revenue',
  EXPENSE: 'Expense',
};

/**
 * The statement a head belongs to, read off the first character of its code. The
 * server decides that character; this only mirrors it for display.
 */
const TYPE_BY_LETTER: Record<string, AccountType> = {
  A: 'ASSET',
  L: 'LIABILITY',
  P: 'EQUITY',
  R: 'REVENUE',
  E: 'EXPENSE',
};

const typeForLetter = (letter: string): AccountType => TYPE_BY_LETTER[letter.toUpperCase()] ?? 'ASSET';

interface HeadForm {
  name: string;
  type: AccountType;
  description: string;
}
interface SubForm {
  name: string;
  description: string;
}

interface HeadPayload {
  accountType?: AccountType;
  name: string;
  description?: string;
  status: string;
}

interface SubPayload {
  name: string;
  headAccountId: string;
  description?: string;
  status: string;
}

export default function ChartOfAccountsPage() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const canCreateHead = can('administration.head-accounts.create');
  const canUpdateHead = can('administration.head-accounts.update');
  const canDeleteHead = can('administration.head-accounts.delete');
  const canCreateSub = can('administration.sub-heads.create');
  const canUpdateSub = can('administration.sub-heads.update');
  const canDeleteSub = can('administration.sub-heads.delete');
  const { data: heads, isLoading: headsLoading } = useFlatOptions<Head>('head-accounts');
  const { data: subHeads, isLoading: subLoading } = useFlatOptions<SubHead>('sub-heads');

  const [open, setOpen] = useState<Record<string, boolean>>({});

  const grouped = useMemo(() => {
    const children: Record<string, SubHead[]> = {};
    for (const s of subHeads) {
      (children[s.headAccountId] ??= []).push(s);
    }
    for (const k of Object.keys(children)) {
      children[k].sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
    }
    return children;
  }, [subHeads]);

  const sortedHeads = useMemo(
    () => [...heads].sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true })),
    [heads],
  );

  // ---- Head create/edit ----
  const [headModal, setHeadModal] = useState(false);
  const [editingHead, setEditingHead] = useState<Head | null>(null);
  const [headForm, setHeadForm] = useState<HeadForm>({ name: '', type: 'ASSET', description: '' });
  const [headError, setHeadError] = useState('');
  const [headSaving, setHeadSaving] = useState(false);

  // ---- Sub create/edit ----
  const [subModal, setSubModal] = useState(false);
  const [subParentHead, setSubParentHead] = useState<Head | null>(null);
  const [editingSub, setEditingSub] = useState<SubHead | null>(null);
  const [subForm, setSubForm] = useState<SubForm>({ name: '', description: '' });
  const [subError, setSubError] = useState('');
  const [subSaving, setSubSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<{ type: 'head' | 'sub'; id: string; name: string } | null>(null);
  const [delWarn, setDelWarn] = useState<{ name: string; labels: string[] } | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Codes are assigned by the server from the type and the chosen parent; the
  // form only shows what would be issued.
  const { code: nextHeadCode, isLoading: headCodeLoading } = useNextAccountCode(
    '/head-accounts',
    { accountType: headForm.type },
    headModal && !editingHead,
  );
  const { code: nextSubCode, isLoading: subCodeLoading } = useNextAccountCode(
    '/sub-heads',
    { headAccountId: subParentHead?.id },
    subModal && !editingSub && !!subParentHead,
  );

  const openNewHead = () => {
    setEditingHead(null);
    setHeadForm({ name: '', type: 'ASSET', description: '' });
    setHeadError('');
    setHeadModal(true);
  };
  const openEditHead = (h: Head) => {
    setEditingHead(h);
    setHeadForm({
      name: h.name,
      type: typeForLetter(letterOf(h.code)),
      description: h.description ?? '',
    });
    setHeadError('');
    setHeadModal(true);
  };

  const openNewSub = (head: Head) => {
    setSubParentHead(head);
    setEditingSub(null);
    setSubForm({ name: '', description: '' });
    setSubError('');
    setSubModal(true);
  };
  const openEditSub = (head: Head, sub: SubHead) => {
    setSubParentHead(head);
    setEditingSub(sub);
    setSubForm({ name: sub.name, description: '' });
    setSubError('');
    setSubModal(true);
  };

  const submitHead = async () => {
    setHeadError('');
    if (!headForm.name.trim()) return setHeadError('Name is required');
    setHeadSaving(true);
    try {
      // The code is the server's to assign, from the account type. On edit the
      // type is fixed (it is baked into an immutable code), so only the details
      // are sent.
      const payload: HeadPayload = {
        ...(editingHead ? {} : { accountType: headForm.type }),
        name: headForm.name.trim(),
        description: headForm.description.trim() || undefined,
        status: 'active',
      };
      if (editingHead) {
        await apiFetch(`/head-accounts/${editingHead.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      } else {
        await apiFetch('/head-accounts', { method: 'POST', body: JSON.stringify(payload) });
      }
      qc.invalidateQueries({ queryKey: ['flat', 'head-accounts'] });
      qc.invalidateQueries({ queryKey: ['flat', 'sub-heads'] });
      qc.invalidateQueries({ queryKey: ['head-accounts', 'next-code'] });
      setHeadModal(false);
    } catch (e) {
      setHeadError((e as Error).message);
    } finally {
      setHeadSaving(false);
    }
  };

  const submitSub = async () => {
    if (!subParentHead) return;
    setSubError('');
    if (!subForm.name.trim()) return setSubError('Name is required');
    setSubSaving(true);
    try {
      const payload: SubPayload = {
        name: subForm.name.trim(),
        headAccountId: subParentHead.id,
        description: subForm.description.trim() || undefined,
        status: 'active',
      };
      if (editingSub) {
        await apiFetch(`/sub-heads/${editingSub.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      } else {
        await apiFetch('/sub-heads', { method: 'POST', body: JSON.stringify(payload) });
      }
      qc.invalidateQueries({ queryKey: ['flat', 'sub-heads'] });
      qc.invalidateQueries({ queryKey: ['flat', 'head-accounts'] });
      qc.invalidateQueries({ queryKey: ['sub-heads', 'next-code'] });
      setSubModal(false);
    } catch (e) {
      setSubError((e as Error).message);
    } finally {
      setSubSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      if (deleteTarget.type === 'head') {
        await apiFetch(`/head-accounts/${deleteTarget.id}`, { method: 'DELETE' });
        qc.invalidateQueries({ queryKey: ['flat', 'head-accounts'] });
      } else {
        await apiFetch(`/sub-heads/${deleteTarget.id}`, { method: 'DELETE' });
        qc.invalidateQueries({ queryKey: ['flat', 'sub-heads'] });
      }
      setDeleteTarget(null);
      toast.success(deleteTarget.type === 'head' ? 'Head account deleted' : 'Sub head deleted');
    } catch (e) {
      const info = parseDeleteGuard(e);
      if (info && deleteTarget) {
        setDeleteTarget(null);
        setDelWarn({ name: deleteTarget.name, labels: info.labels });
      } else {
        toast.error(deleteErrorMessage(e, deleteTarget.type === 'head' ? 'Head account' : 'Sub head'));
      }
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Chart of Accounts"
        description="Head accounts and their sub heads on a single screen. Codes follow the A / L / E / R / P scheme."
        actions={canCreateHead ? (<Button onClick={openNewHead}><Plus className="h-4 w-4" /> New Head</Button>) : undefined}
      />

      <Card>
        <div className="border-b border-slate-100 px-4 py-4">
          <p className="text-xs text-slate-500">
            Code scheme: <Badge tone="teal">A1</Badge> head · <Badge tone="teal">A1-001</Badge> sub head ·{' '}
            <Badge tone="teal">A1-001-0001</Badge> main account. A=Assets, E=Expenses, L=Liabilities, R=Revenue, P=Proprietorship.
          </p>
        </div>

        {headsLoading || subLoading ? (
          <Spinner />
        ) : sortedHeads.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <Landmark className="h-6 w-6" />
            </div>
            <p className="text-sm font-medium text-slate-700">No head accounts yet</p>
            <p className="max-w-sm text-xs text-slate-400">Create your first head account to start building the chart of accounts.</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {sortedHeads.map((head) => {
              const subs = grouped[head.id] ?? [];
              const isOpen = open[head.id] ?? true;
              return (
                <li key={head.id}>
                  <div className="group flex items-center gap-3 px-4 py-3 hover:bg-slate-50/70">
                    <button
                      onClick={() => setOpen((o) => ({ ...o, [head.id]: !isOpen }))}
                      className="rounded-md p-1 text-slate-400 hover:bg-slate-100"
                      aria-label={isOpen ? 'Collapse' : 'Expand'}
                    >
                      {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-semibold text-teal-700">{head.code}</span>
                        <span className="truncate text-sm font-medium text-slate-800">{head.name}</span>
                      </div>
                      {head.description && <p className="truncate text-xs text-slate-400">{head.description}</p>}
                    </div>
                    <Badge tone={toneForType(typeForLetter(letterOf(head.code)))}>{ACCOUNT_TYPE_LABELS[typeForLetter(letterOf(head.code))]}</Badge>
                    <span className="text-xs text-slate-400">{subs.length} sub</span>
                    <div className="flex items-center gap-1">
                      {canCreateSub && <button onClick={() => openNewSub(head)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-teal-50 hover:text-teal-700" title="Add Sub Head"><Plus className="h-3.5 w-3.5" /> Sub</button>}
                      {canUpdateHead && <button onClick={() => openEditHead(head)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-teal-700" title="Edit Head"><Pencil className="h-4 w-4" /></button>}
                      {canDeleteHead && <button onClick={() => setDeleteTarget({ type: 'head', id: head.id, name: head.name })} className="rounded-lg p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600" title="Delete Head"><Trash2 className="h-4 w-4" /></button>}
                    </div>
                  </div>

                  {isOpen && subs.length > 0 && (
                    <ul className="border-l border-slate-100 bg-slate-50/40">
                      {subs.map((sub) => (
                        <li key={sub.id} className="group flex items-center gap-3 py-2 pl-12 pr-4 hover:bg-slate-100/60">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-sm font-medium text-slate-500">{sub.code}</span>
                              <span className="truncate text-sm text-slate-700">{sub.name}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            {canUpdateSub && <button onClick={() => openEditSub(head, sub)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-teal-700" title="Edit Sub Head"><Pencil className="h-4 w-4" /></button>}
                            {canDeleteSub && <button onClick={() => setDeleteTarget({ type: 'sub', id: sub.id, name: sub.name })} className="rounded-lg p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600" title="Delete Sub Head"><Trash2 className="h-4 w-4" /></button>}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* Head modal */}
      <Modal open={headModal} onClose={() => setHeadModal(false)} title={editingHead ? 'Edit Head Account' : 'New Head Account'}>
        <form onSubmit={(e) => { e.preventDefault(); submitHead(); }} className="space-y-4">
          <Field label="Name" required>
            <Input value={headForm.name} onChange={(e) => setHeadForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Assets" required />
          </Field>
          <Field label="Type" required hint="Determines the code letter: A (Assets), L (Liabilities), E (Expenses), R (Revenue), P (Proprietorship).">
            <Select
              value={headForm.type}
              onChange={(e) => setHeadForm((f) => ({ ...f, type: e.target.value as AccountType }))}
              disabled={!!editingHead}
            >
              {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{ACCOUNT_TYPE_LABELS[t]}</option>)}
            </Select>
          </Field>
          {editingHead ? (
            <Field label="Code" hint="Fixed for the life of the head — it is part of every code beneath it.">
              <Input readOnly value={editingHead.code} className="bg-slate-100 font-mono text-slate-500" />
            </Field>
          ) : (
            <AutoCodeField code={nextHeadCode} isLoading={headCodeLoading} />
          )}
          <Field label="Description">
            <Input value={headForm.description} onChange={(e) => setHeadForm((f) => ({ ...f, description: e.target.value }))} />
          </Field>

          {headError && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{headError}</div>}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setHeadModal(false)}>Cancel</Button>
            <Button type="submit" loading={headSaving}>{editingHead ? 'Save changes' : 'Create'}</Button>
          </div>
        </form>
      </Modal>

      {/* Sub head modal */}
      <Modal open={subModal} onClose={() => setSubModal(false)} title={editingSub ? 'Edit Sub Head' : 'New Sub Head'}>
        <form onSubmit={(e) => { e.preventDefault(); submitSub(); }} className="space-y-4">
          <Field label="Head Account" required>
            <div className="rounded-lg bg-slate-100 px-3.5 py-2.5 text-sm font-medium text-slate-700">
              {subParentHead?.code} · {subParentHead?.name}
            </div>
          </Field>
          <Field label="Name" required>
            <Input value={subForm.name} onChange={(e) => setSubForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Current Assets" required />
          </Field>
          {editingSub ? (
            <Field label="Code" hint="Fixed unless this sub head is moved to another head, which renumbers it and everything beneath it.">
              <Input readOnly value={editingSub.code} className="bg-slate-100 font-mono text-slate-500" />
            </Field>
          ) : (
            <AutoCodeField
              code={nextSubCode}
              isLoading={subCodeLoading}
              parentLabel={subParentHead ? `Extends ${subParentHead.code}` : undefined}
            />
          )}
          <Field label="Status">
            <Select defaultValue="active">
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
          </Field>

          {subError && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{subError}</div>}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setSubModal(false)}>Cancel</Button>
            <Button type="submit" loading={subSaving}>{editingSub ? 'Save changes' : 'Create'}</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        danger
        title={deleteTarget?.type === 'head' ? 'Delete Head Account' : 'Delete Sub Head'}
        message={
          deleteTarget?.type === 'head'
            ? `Delete "${deleteTarget?.name ?? ''}" and its sub heads. Main accounts with no voucher activity are removed too; accounts with activity block deletion.`
            : `Delete "${deleteTarget?.name ?? ''}". Main accounts with no voucher activity are removed too; accounts with activity block deletion.`
        }
        confirmLabel="Delete"
        loading={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />

      <DeleteWarnDialog
        open={!!delWarn}
        recordName={delWarn?.name ?? ''}
        labels={delWarn?.labels ?? []}
        forceable={false}
        onClose={() => setDelWarn(null)}
        onForce={() => setDelWarn(null)}
      />
    </div>
  );
}

function letterOf(code: string): string {
  return (code.trim().split('-')[0] ?? 'A').charAt(0).toUpperCase();
}

function toneForType(type: string): 'teal' | 'amber' | 'blue' | 'green' | 'red' {
  switch (type) {
    case 'ASSET': return 'teal';
    case 'LIABILITY': return 'amber';
    case 'EQUITY': return 'blue';
    case 'REVENUE': return 'green';
    default: return 'red';
  }
}
