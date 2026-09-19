'use client';

import { SimpleMaster } from '@/components/simple-master';
import type { Column } from '@/components/data-table';
import type { Designation } from '@/lib/types';

const columns: Column<Designation>[] = [
  { key: 'code', header: 'Code', render: (r) => <span className="font-medium text-slate-700">{r.code}</span> },
  { key: 'name', header: 'Name', render: (r) => r.name },
  {
    key: 'department',
    header: 'Department',
    render: (r) => <span className="text-slate-500">{r.department ? `${r.department.code} · ${r.department.name}` : '-'}</span>,
  },
  { key: 'description', header: 'Description', render: (r) => <span className="text-slate-500">{r.description ?? '-'}</span> },
];

export default function DesignationsPage() {
  return (
    <SimpleMaster<Designation>
      config={{
        apiPath: '/hr/designations',
        title: 'Designations',
        description: 'Job titles and roles within each department.',
        singular: 'Designation',
        permission: 'hr.designations.view',
        columns,
        fields: [
          { name: 'code', label: 'Code', auto: true, placeholder: 'e.g. MGR' },
          { name: 'name', label: 'Name', required: true, placeholder: 'e.g. Manager' },
          { name: 'departmentId', label: 'Department', type: 'select', optionsResource: 'hr/departments' },
          { name: 'description', label: 'Description', type: 'textarea' },
          { name: 'status', label: 'Status', type: 'status' },
        ],
      }}
    />
  );
}