'use client';

import { SimpleMaster } from '@/components/simple-master';

export default function BrandsPage() {
  return (
    <SimpleMaster
      config={{
        apiPath: '/brands',
        title: 'Brands',
        description: 'Product brands used across the inventory catalogue.',
        singular: 'Brand',
        permission: 'administration.brands.view',
        columns: [
          { key: 'name', header: 'Name', render: (r) => <span className="font-medium text-slate-800">{String(r.name)}</span> },
          { key: 'description', header: 'Description', render: (r) => r.description ? <span className="text-slate-500">{String(r.description)}</span> : '-' },
        ],
        fields: [
          { name: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g. Nestlé' },
          { name: 'description', label: 'Description', type: 'textarea' },
          { name: 'status', label: 'Status', type: 'status' },
        ],
      }}
    />
  );
}