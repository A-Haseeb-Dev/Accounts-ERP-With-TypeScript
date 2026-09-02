'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Landmark, Pencil, Plus, Trash2 } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/field';
import { Modal } from '@/components/ui/modal';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { PageHeader } from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { useFlatOptions } from '@/hooks/use-options';
import {
  ACCOUNT_TYPES,
  ACCOUNT_TYPE_LABELS,
  nextHeadCode,
  nextSubHeadCode,
  regenerateHeadCode,
  typeForLetter,
} from '@/lib/accounts';

type Head = { id: string; code: string; name: string; description?: string | null; status: string };
type SubHead = { id: string; code: string; name: string; headAccountId: string; headAccount: Head; status: string };

interface HeadForm {
  name: string;
  type: string;
  description: string;
}
interface SubForm {
  name: string;
  description: string;
}

export default function ChartOfAccountsPage() {
  const qc = useQueryClient();
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
  const [deleting, setDeleting] = useState(false);

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
      const code = editingHead
        ? regenerateHeadCode(editingHead.code, headForm.type, heads.map((h) => h.code))
        : nextHeadCode(headForm.type, heads.map((h) => h.code));
      const payload: Record<string, unknown> = {
        code,
        name: headForm.name.trim(),
        description: headForm.description.trim() || undefined,
        status: 'active',
      };
      if (editingHead) {
        const oldCode = editingHead.code;
        await apiFetch(`/head-accounts/${editingHead.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
        // Re-prefix sub head codes when the head code changed (e.g. 01 -> A1).
        if (code !== oldCode) {
          const subs = grouped[editingHead.id] ?? [];
          for (const sub of subs) {
            const newSubCode = `${code}-${suffixOf(sub.code, 3)}`;
            if (newSubCode !== sub.code) {
              await apiFetch(`/sub-heads/${sub.id}`, { method: 'PATCH', body: JSON.stringify({ code: newSubCode }) });
            }
          }
        }
      } else {
        await apiFetch('/head-accounts', { method: 'POST', body: JSON.stringify(payload) });
      }
      qc.invalidateQueries({ queryKey: ['flat', 'head-accounts'] });
      qc.invalidateQueries({ queryKey: ['flat', 'sub-heads'] });
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
      const siblings = grouped[subParentHead.id] ?? [];
      const code = editingSub
        ? editingSub.code
        : nextSubHeadCode(subParentHead.code, siblings.map((s) => s.code));
      const payload: Record<string, unknown> = {
        code,
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
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setDeleting(false);
    }
  };

  const previewCode = editingHead
    ? regenerateHeadCode(editingHead.code, headForm.type, heads.map((h) => h.code))
    : nextHeadCode(headForm.type, heads.map((h) => h.code));
  const subPreviewCode =
    editingSub && subParentHead ? editingSub.code : subParentHead ? nextSubHeadCode(subParentHead.code, (grouped[subParentHead.id] ?? []).map((s) => s.code)) : '';

  return (
    <div>
      <PageHeader
        title="Chart of Accounts"
        description="Head accounts and their sub heads on a single screen. Codes follow the A / L / E / R / P scheme."
        actions={<Button onClick={openNewHead}><Plus className="h-4 w-4" /> New Head</Button>}
      />

      <Card>
        <div className="border-b border-slate-100 px-4 py-4">
          <p className="text-xs text-slate-500">
            Code scheme: <Badge tone="teal">A1</Badge> head · <Badge tone="teal">A1-001</Badge> sub head ·{' '}
            <Badge tone="teal">A1-001-00001</Badge> main account. A=Assets, E=Expenses, L=Liabilities, R=Revenue, P=Proprietorship.
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
                      <button onClick={() => openNewSub(head)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-teal-50 hover:text-teal-700" title="Add Sub Head"><Plus className="h-3.5 w-3.5" /> Sub</button>
                      <button onClick={() => openEditHead(head)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-teal-700" title="Edit Head"><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => setDeleteTarget({ type: 'head', id: head.id, name: head.name })} className="rounded-lg p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600" title="Delete Head"><Trash2 className="h-4 w-4" /></button>
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
                            <button onClick={() => openEditSub(head, sub)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-teal-700" title="Edit Sub Head"><Pencil className="h-4 w-4" /></button>
                            <button onClick={() => setDeleteTarget({ type: 'sub', id: sub.id, name: sub.name })} className="rounded-lg p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600" title="Delete Sub Head"><Trash2 className="h-4 w-4" /></button>
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
            <Select value={headForm.type} onChange={(e) => setHeadForm((f) => ({ ...f, type: e.target.value }))}>
              {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{ACCOUNT_TYPE_LABELS[t]}</option>)}
            </Select>
          </Field>
          <Field label="Generated Code">
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3.5 py-2.5 font-mono text-sm font-semibold text-teal-700">{previewCode}</div>
          </Field>
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
          <Field label="Generated Code">
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3.5 py-2.5 font-mono text-sm font-semibold text-teal-700">{subPreviewCode}</div>
          </Field>
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
    </div>
  );
}

function letterOf(code: string): string {
  return (code.trim().split('-')[0] ?? 'A').charAt(0).toUpperCase();
}

function suffixOf(code: string, pad: number): string {
  const parts = code.trim().split('-');
  const last = parts[parts.length - 1].trim();
  const num = parseInt(last, 10);
  if (Number.isNaN(num)) return last.padStart(pad, '0');
  return String(num).padStart(pad, '0');
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
