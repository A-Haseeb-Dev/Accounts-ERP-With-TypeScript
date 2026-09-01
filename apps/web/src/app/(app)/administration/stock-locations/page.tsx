'use client';

import { SimpleMaster } from '@/components/simple-master';

export default function StockLocationsPage() {
  return (
    <SimpleMaster
      config={{
        apiPath: '/stock-locations',
        title: 'Stock Locations',
        description: 'Warehouses or store locations where inventory is tracked.',
        singular: 'Stock Location',
        permission: 'administration.stock-locations.view',
        columns: [
          { key: 'code', header: 'Code', render: (r) => <span className="font-mono font-semibold text-slate-800">{String(r.code)}</span> },
          { key: 'name', header: 'Name', render: (r) => <span className="font-medium text-slate-800">{String(r.name)}</span> },
          { key: 'description', header: 'Description', render: (r) => r.description ? <span className="text-slate-500">{String(r.description)}</span> : '-' },
        ],
        fields: [
          { name: 'code', label: 'Code', type: 'text', required: true, placeholder: 'e.g. WH01' },
          { name: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g. Main Warehouse' },
          { name: 'description', label: 'Description', type: 'textarea' },
          { name: 'status', label: 'Status', type: 'status' },
        ],
      }}
    />
  );
}