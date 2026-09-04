'use client';

import { SimpleMaster } from '@/components/simple-master';
import type { Brand } from '@/lib/types';

export default function BrandsPage() {
  return (
    <SimpleMaster<Brand>
      config={{
        apiPath: '/brands',
        title: 'Brands',
        description: 'Product brands used across the inventory catalogue.',
        singular: 'Brand',
        permission: 'administration.brands.view',
        columns: [
          { key: 'name', header: 'Name', render: (r) => <span className="font-medium text-slate-800">{r.name}</span> },
          { key: 'description', header: 'Description', render: (r) => r.description ? <span className="text-slate-500">{r.description}</span> : '-' },
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