'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Plus, Pencil, Shield, Trash2 } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/field';
import { Modal } from '@/components/ui/modal';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';
import { ConfirmDialog } from '@/components/confirm-dialog';
import type { Permission, Role } from '@/lib/types';

interface RoleForm {
  name: string;
  description?: string;
}

export default function RolesPage() {
  const qc = useQueryClient();

  const { data: roles, isLoading: rolesLoading } = useQuery<Role[]>({
    queryKey: ['roles'],
    queryFn: () => apiFetch('/roles'),
  });

  const { data: permissions } = useQuery<Permission[]>({
    queryKey: ['permissions'],
    queryFn: () => apiFetch('/permissions'),
  });

  const grouped = useMemo(() => {
    const map = new Map<string, Permission[]>();
    for (const p of permissions ?? []) {
      const mod = p.module ?? 'other';
      if (!map.has(mod)) map.set(mod, []);
      map.get(mod)!.push(p);
    }
    return map;
  }, [permissions]);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<RoleForm>({ name: '', description: '' });
  const [selectedPerms, setSelectedPerms] = useState<Set<string>>(new Set());
  const [error, setError] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Role | null>(null);

  const create = useMutation({
    mutationFn: (payload: unknown) => apiFetch('/roles', { method: 'POST', body: JSON.stringify(payload) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['roles'] }); setModalOpen(false); },
    onError: (e: Error) => setError(e.message),
  });

  const update = useMutation({
    mutationFn: ({ id, ...body }: { id: string; [k: string]: unknown }) => apiFetch(`/roles/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['roles'] }); setModalOpen(false); setEditId(null); },
    onError: (e: Error) => setError(e.message),
  });

  const savePerms = useMutation({
    mutationFn: ({ id, permissionIds }: { id: string; permissionIds: string[] }) => apiFetch(`/roles/${id}/permissions`, { method: 'POST', body: JSON.stringify({ permissionIds }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['roles'] }); setModalOpen(false); setEditId(null); },
    onError: (e: Error) => setError(e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => apiFetch(`/roles/${id}`, { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['roles'] }); setDeleteTarget(null); },
  });

  const togglePerm = (permId: string) => {
    setSelectedPerms((prev) => {
      const next = new Set(prev);
      if (next.has(permId)) next.delete(permId);
      else next.add(permId);
      return next;
    });
  };

  const toggleAllModule = (modPerms: Permission[]) => {
    const allSelected = modPerms.every((p) => selectedPerms.has(p.id));
    setSelectedPerms((prev) => {
      const next = new Set(prev);
      for (const p of modPerms) {
        if (allSelected) next.delete(p.id);
        else next.add(p.id);
      }
      return next;
    });
  };

  const startEdit = (row: Role) => {
    setForm({ name: row.name ?? '', description: row.description ?? '' });
    const rolePerms = (row.permissions ?? []).map((rp) => rp.permission.id);
    setSelectedPerms(new Set(rolePerms.filter(Boolean)));
    setEditId(row.id);
    setError('');
    setModalOpen(true);
  };

  const startCreate = () => { setForm({ name: '', description: '' }); setSelectedPerms(new Set()); setEditId(null); setError(''); setModalOpen(true); };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const permIds = Array.from(selectedPerms);
    if (editId) {
      savePerms.mutate({ id: editId, permissionIds: permIds }, { onError: () => {}, onSuccess: () => {
        update.mutate({ id: editId, name: form.name, description: form.description || undefined });
      }});
    } else {
      create.mutate({ ...form, permissionIds: permIds });
    }
  };

  return (
    <div>
      <PageHeader title="Roles & Permissions" description="Manage role-based access control." actions={<Button onClick={startCreate}><Plus className="h-4 w-4" /> New Role</Button>} />

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500">
                <th className="px-4 py-2">Role</th>
                <th className="px-4 py-2">Description</th>
                <th className="px-4 py-2">Permissions</th>
                <th className="px-4 py-2">Users</th>
                <th className="px-4 py-2">System</th>
                <th className="px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(roles ?? []).map((r) => (
                <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-2 font-medium text-slate-800">{r.name}</td>
                  <td className="px-4 py-2 text-xs text-slate-500">{r.description ?? '—'}</td>
                  <td className="px-4 py-2 text-xs text-slate-600">{r.permissions?.length ?? 0}</td>
                  <td className="px-4 py-2 text-xs text-slate-600">{r._count?.users ?? 0}</td>
                  <td className="px-4 py-2">{r.isSystem ? <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">System</span> : '—'}</td>
                  <td className="px-4 py-2">
                    <div className="flex gap-0.5">
                      <button onClick={() => startEdit(r)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-blue-700" title="Edit"><Pencil className="h-4 w-4" /></button>
                      {!r.isSystem && <button onClick={() => setDeleteTarget(r)} className="rounded-lg p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600" title="Delete"><Trash2 className="h-4 w-4" /></button>}
                    </div>
                  </td>
                </tr>
              ))}
              {(!roles || roles.length === 0) && !rolesLoading && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No roles.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editId ? 'Edit Role' : 'New Role'} size="lg">
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Role Name" required><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required /></Field>
            <Field label="Description"><Textarea value={form.description ?? ''} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} /></Field>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-slate-700">Permissions</p>
            <div className="max-h-[400px] overflow-y-auto rounded-lg border border-slate-200 p-3 space-y-3">
              {Array.from(grouped.entries()).map(([mod, perms]) => {
                const allSel = perms.every((p) => selectedPerms.has(p.id));
                return (
                  <div key={mod}>
                    <label className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <input type="checkbox" checked={allSel} onChange={() => toggleAllModule(perms)} className="rounded border-slate-300" />
                      {mod}
                    </label>
                    <div className="ml-5 flex flex-wrap gap-1.5">
                      {perms.map((p) => (
                        <button type="button" key={p.id} onClick={() => togglePerm(p.id)}
                          className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${selectedPerms.has(p.id) ? 'bg-blue-100 text-blue-700 ring-1 ring-blue-300' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                        >
                          {p.action}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="mt-1 text-xs text-slate-400">{selectedPerms.size} permission{selectedPerms.size !== 1 ? 's' : ''} selected</p>
          </div>

          {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit" loading={create.isPending || update.isPending || savePerms.isPending}>{editId ? 'Save' : 'Create'}</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        danger
        title="Delete Role"
        message={`Delete role "${deleteTarget?.name ?? ''}"? Users with this role will lose associated permissions.`}
        confirmLabel="Delete"
        loading={del.isPending}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget?.id && del.mutate(deleteTarget.id)}
      />
    </div>
  );
}