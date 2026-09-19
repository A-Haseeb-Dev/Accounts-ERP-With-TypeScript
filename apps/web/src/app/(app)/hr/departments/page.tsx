'use client';

import { SimpleMaster } from '@/components/simple-master';
import type { Column } from '@/components/data-table';
import type { Department } from '@/lib/types';

const columns: Column<Department>[] = [
  { key: 'code', header: 'Code', render: (r) => <span className="font-medium text-slate-700">{r.code}</span> },
  { key: 'name', header: 'Name', render: (r) => r.name },
  { key: 'description', header: 'Description', render: (r) => <span className="text-slate-500">{r.description ?? '-'}</span> },
];

export default function DepartmentsPage() {
  return (
    <SimpleMaster<Department>
      config={{
        apiPath: '/hr/departments',
        title: 'Departments',
        description: 'Organize employees into departments and manage them here.',
        singular: 'Department',
        permission: 'hr.departments.view',
        columns,
        fields: [
          { name: 'code', label: 'Code', auto: true, placeholder: 'e.g. ACC' },
          { name: 'name', label: 'Name', required: true, placeholder: 'e.g. Accounts' },
          { name: 'description', label: 'Description', type: 'textarea' },
          { name: 'status', label: 'Status', type: 'status' },
        ],
      }}
    />
  );
}