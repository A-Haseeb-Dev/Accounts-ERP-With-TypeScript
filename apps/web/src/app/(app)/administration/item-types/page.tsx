'use client';

import { SimpleMaster } from '@/components/simple-master';

export default function ItemTypesPage() {
  return (
    <SimpleMaster
      config={{
        apiPath: '/item-types',
        title: 'Item Types',
        description: 'Categories used to group your products (e.g. Beverages, Snacks, Dairy).',
        singular: 'Item Type',
        permission: 'administration.item-types.view',
        columns: [
          { key: 'name', header: 'Name', render: (r) => <span className="font-medium text-slate-800">{String(r.name)}</span> },
          { key: 'description', header: 'Description', render: (r) => r.description ? <span className="text-slate-500">{String(r.description)}</span> : '-' },
        ],
        fields: [
          { name: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g. Beverages' },
          { name: 'description', label: 'Description', type: 'textarea' },
          { name: 'status', label: 'Status', type: 'status' },
        ],
      }}
    />
  );
}