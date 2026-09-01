'use client';

import { useFlatOptions } from '@/hooks/use-options';
import { DocumentPage } from '@/components/tx/document-page';

export default function PurchasesPage() {
  const { options: supplierOptions } = useFlatOptions('suppliers');
  const { options: locationOptions } = useFlatOptions('stock-locations');

  return (
    <DocumentPage
      config={{
        resource: 'purchases',
        title: 'Purchases',
        description: 'Purchase invoices that move stock into your locations.',
        dateField: 'purchaseDate',
        partyLabel: 'Supplier',
        partyParam: 'supplierId',
        partyOptions: supplierOptions,
        priceKey: 'unitCost',
        itemLineField: 'unitCost',
        locationOptions,
        newLabel: 'Purchase',
      }}
    />
  );
}