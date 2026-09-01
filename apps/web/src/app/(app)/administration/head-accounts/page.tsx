'use client';

import { SimpleMaster } from '@/components/simple-master';

export default function HeadAccountsPage() {
  return (
    <SimpleMaster
      config={{
        apiPath: '/head-accounts',
        title: 'Head Accounts',
        description: 'Top-level classification of the chart of accounts for types (ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE).',
        singular: 'Head Account',
        permission: 'administration.head-accounts.view',
        columns: [
          { key: 'code', header: 'Code', render: (r) => <span className="font-mono font-semibold text-slate-800">{String(r.code)}</span> },
          { key: 'name', header: 'Name', render: (r) => <span className="font-medium text-slate-800">{String(r.name)}</span> },
          { key: 'description', header: 'Description', render: (r) => r.description ? <span className="text-slate-500">{String(r.description)}</span> : '-' },
        ],
        fields: [
          { name: 'code', label: 'Code', type: 'text', required: true, placeholder: 'e.g. 06' },
          { name: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g. Assets' },
          { name: 'description', label: 'Description', type: 'textarea' },
          { name: 'status', label: 'Status', type: 'status' },
        ],
      }}
    />
  );
}