'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { apiFetch, qs } from '@/lib/api';
import { useAuth } from '@/context/auth-context';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { DataTable, type Column } from '@/components/data-table';
import { Modal } from '@/components/ui/modal';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { PageHeader } from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/badge';
import { dateTime } from '@/lib/utils';
import { toast } from 'sonner';
import type { Paginated } from '@/lib/types';

export interface FieldDef {
  name: string;
  label: string;
  type?: 'text' | 'number' | 'select' | 'textarea' | 'status';
  options?: { value: string; label: string }[];
  required?: boolean;
  placeholder?: string;
}

export interface SimpleMasterConfig<TRecord extends { id: string }> {
  apiPath: string;
  title: string;
  description: string;
  singular: string;
  permission: string;
  columns: Column<TRecord>[];
  fields: FieldDef[];
  allowStatusFilter?: boolean;
}

export function SimpleMaster<TRecord extends { id: string }>({ config }: { config: SimpleMasterConfig<TRecord> }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TRecord | null>(null);
  const [form, setForm] = useState<Partial<TRecord> & Record<string, unknown>>({});
  const [deleteTarget, setDeleteTarget] = useState<TRecord | null>(null);
  const [formError, setFormError] = useState('');

  const canCreate = can(config.permission.replace('view', 'create'));
  const canUpdate = can(config.permission.replace('view', 'update'));
  const canDelete = can(config.permission.replace('view', 'delete'));

  const { data, isLoading } = useQuery<Paginated<TRecord>>({
    queryKey: [config.apiPath, page, search, status],
    queryFn: () =>
      apiFetch(config.apiPath + qs({ page, pageSize: 20, search: search || undefined, status: status || undefined })),
  });

  const saveMutation = useMutation({
    mutationFn: async (payload: unknown) => {
      if (editing?.id) {
        return apiFetch(`${config.apiPath}/${editing.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      }
      return apiFetch(config.apiPath, { method: 'POST', body: JSON.stringify(payload) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [config.apiPath] });
      setModalOpen(false);
      setEditing(null);
      setForm({});
      toast.success(editing ? `${config.singular} updated` : `${config.singular} created`);
    },
    onError: (e: Error) => {
      setFormError(e.message);
      toast.error(e.message || 'Something went wrong');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`${config.apiPath}/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [config.apiPath] });
      setDeleteTarget(null);
      toast.success(`${config.singular} deleted`);
    },
    onError: (e: Error) => toast.error(e.message || 'Delete failed'),
  });

  const openCreate = () => {
    setEditing(null);
    setForm({});
    setFormError('');
    setModalOpen(true);
  };

  const openEdit = (row: TRecord) => {
    setEditing(row);
    setForm(row);
    setFormError('');
    setModalOpen(true);
  };

  const onFieldChange = (name: string, value: unknown) => {
    setForm((f) => ({ ...f, [name]: value }));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    saveMutation.mutate(form);
  };

  const columns = useMemo<Column<TRecord>[]>(() => {
    const base: Column<TRecord>[] = [...config.columns];
    if (config.allowStatusFilter !== false) {
      base.push({
        key: 'status',
        header: 'Status',
        render: (r) => <StatusBadge status={String((r as Record<string, unknown>).status ?? '')} />,
      });
    }
    base.push({
      key: 'updatedAt',
      header: 'Updated',
      render: (r) => <span className="text-xs text-slate-400">{dateTime((r as Record<string, unknown>).updatedAt)}</span>,
    });
    if (canUpdate || canDelete) {
      base.push({
        key: 'actions',
        header: 'Actions',
        className: 'w-24',
        render: (r) => (
          <div className="flex items-center gap-1">
            {canUpdate && (
              <button onClick={() => openEdit(r)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-teal-700" title="Edit">
                <Pencil className="h-4 w-4" />
              </button>
            )}
            {canDelete && (
              <button onClick={() => setDeleteTarget(r)} className="rounded-lg p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600" title="Delete">
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        ),
      });
    }
    return base;
  }, [config.columns, config.allowStatusFilter, canUpdate, canDelete]);

  const optionsFor = (field: FieldDef) => field.options ?? [];
  const targetLabel = deleteTarget
    ? String((deleteTarget as Record<string, unknown>).name ?? (deleteTarget as Record<string, unknown>).code ?? '')
    : '';

  return (
    <div>
      <PageHeader
        title={config.title}
        description={config.description}
        actions={canCreate && <Button onClick={openCreate}><Plus className="h-4 w-4" /> New {config.singular}</Button>}
      />

      <Card>
        <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search…"
              className="pl-9"
            />
          </div>
          {config.allowStatusFilter !== false && (
            <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="w-36">
              <option value="">All status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
          )}
        </div>
        <DataTable<TRecord>
          columns={columns}
          data={data?.items ?? []}
          loading={isLoading}
          rowKey={(r) => r.id}
          page={page}
          pageSize={20}
          total={data?.total}
          onPageChange={setPage}
          emptyTitle={`No ${config.singular.toLowerCase()}s yet`}
          emptyMessage={`Create your first ${config.singular.toLowerCase()} using the button above.`}
        />
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Edit ${config.singular}` : `New ${config.singular}`}
        size="md"
      >
        <form onSubmit={submit} className="space-y-4">
          {config.fields.map((field) =>
            field.type === 'textarea' ? (
              <Field key={field.name} label={field.label} required={field.required}>
                <Textarea
                  value={String(form[field.name] ?? '')}
                  onChange={(e) => onFieldChange(field.name, e.target.value)}
                />
              </Field>
            ) : field.type === 'select' || field.type === 'status' ? (
              <Field key={field.name} label={field.label} required={field.required}>
                <Select
                  value={String(form[field.name] ?? '')}
                  onChange={(e) => onFieldChange(field.name, e.target.value)}
                >
                  <option value="">Select…</option>
                  {optionsFor(field).map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                  {field.type === 'status' && (
                    <>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </>
                  )}
                </Select>
              </Field>
            ) : (
              <Field key={field.name} label={field.label} required={field.required}>
                <Input
                  type={field.type === 'number' ? 'number' : 'text'}
                  step={field.type === 'number' ? '0.01' : undefined}
                  value={String(form[field.name] ?? '')}
                  placeholder={field.placeholder}
                  onChange={(e) =>
                    onFieldChange(field.name, field.type === 'number' ? (e.target.value === '' ? 0 : Number(e.target.value)) : e.target.value)
                  }
                />
              </Field>
            ),
          )}

          {formError && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{formError}</div>}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit" loading={saveMutation.isPending}>{editing ? 'Save changes' : 'Create'}</Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        danger
        title={`Delete ${config.singular}`}
        message={`This will permanently delete "${targetLabel}". This action cannot be undone.`}
        confirmLabel="Delete"
        loading={deleteMutation.isPending}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget?.id && deleteMutation.mutate(deleteTarget.id)}
      />
    </div>
  );
}