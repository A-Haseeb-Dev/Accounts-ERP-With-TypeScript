'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { Modal } from '@/components/ui/modal';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { PageHeader } from '@/components/page-header';
import { useFlatOptions } from '@/hooks/use-options';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { dateTime } from '@/lib/utils';

type Row = Record<string, unknown>;

export default function UsersPage() {
  const qc = useQueryClient();
  const { options: roleOptions } = useFlatOptions('roles');

  const { data, isLoading } = useQuery<{ items: Row[]; total: number }>({
    queryKey: ['users'],
    queryFn: () => apiFetch('/users'),
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [error, setError] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Row | null>(null);

  const create = useMutation({
    mutationFn: (payload: unknown) => apiFetch('/users', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); setModalOpen(false); },
    onError: (e: Error) => setError(e.message),
  });

  const update = useMutation({
    mutationFn: ({ id, ...body }: { id: string; [k: string]: unknown }) => apiFetch(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); setModalOpen(false); setEditId(null); },
    onError: (e: Error) => setError(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => apiFetch(`/users/${id}`, { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); setDeleteTarget(null); },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const payload = { ...form };
    if (payload.roleIds && !Array.isArray(payload.roleIds)) {
      payload.roleIds = [payload.roleIds];
    }
    if (editId) {
      update.mutate({ id: editId, ...payload });
    } else {
      create.mutate(payload);
    }
  };

  const startEdit = (row: Row) => {
    setForm({ fullName: String(row.fullName ?? ''), username: String(row.username ?? ''), email: String(row.email ?? ''), phone: String(row.phone ?? ''), status: String(row.status ?? 'active') });
    setEditId(String(row.id));
    setError('');
    setModalOpen(true);
  };

  const startCreate = () => { setForm({ fullName: '', username: '', email: '', phone: '', password: '', status: 'active' }); setEditId(null); setError(''); setModalOpen(true); };

  return (
    <div>
      <PageHeader title="Users" description="Manage team access and user accounts." actions={<Button onClick={startCreate}><Plus className="h-4 w-4" /> New User</Button>} />

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Username</th>
                <th className="px-4 py-2">Email</th>
                <th className="px-4 py-2">Roles</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Created</th>
                <th className="px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(data?.items ?? []).map((r) => (
                <tr key={String(r.id)} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-2 font-medium text-slate-800">{String(r.fullName)}</td>
                  <td className="px-4 py-2 font-mono text-slate-600">{String(r.username)}</td>
                  <td className="px-4 py-2 text-slate-600">{String(r.email ?? '—')}</td>
                  <td className="px-4 py-2 text-xs text-slate-500">{(r.roles as Row[] | undefined)?.map((ro) => ro.name).join(', ') ?? '—'}</td>
                  <td className="px-4 py-2"><StatusBadge status={String(r.status)} /></td>
                  <td className="px-4 py-2 text-xs text-slate-400">{dateTime(r.createdAt)}</td>
                  <td className="px-4 py-2">
                    <div className="flex gap-0.5">
                      <button onClick={() => startEdit(r)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-blue-700"><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => setDeleteTarget(r)} className="rounded-lg p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {(!data || data.items.length === 0) && !isLoading && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">No users found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editId ? 'Edit User' : 'New User'}>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Full Name" required><Input value={String(form.fullName ?? '')} onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))} required /></Field>
          <Field label="Username" required><Input value={String(form.username ?? '')} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} required disabled={!!editId} /></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Email"><Input type="email" value={String(form.email ?? '')} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} /></Field>
            <Field label="Phone"><Input value={String(form.phone ?? '')} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} /></Field>
          </div>
          {!editId && <Field label="Password" required><Input type="password" minLength={8} value={String(form.password ?? '')} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} required /></Field>}
          <Field label="Roles">
            <Select value={String(form.roleIds ?? '')} onChange={(e) => setForm((f) => ({ ...f, roleIds: [e.target.value] }))}>
              <option value="">Select role…</option>
              {roleOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </Field>
          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit" loading={create.isPending || update.isPending}>{editId ? 'Save' : 'Create'}</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        danger
        title="Delete User"
        message={`Delete user "${String(deleteTarget?.fullName ?? '')}"? This cannot be undone.`}
        confirmLabel="Delete"
        loading={del.isPending}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget?.id && del.mutate(String(deleteTarget.id))}
      />
    </div>
  );
}