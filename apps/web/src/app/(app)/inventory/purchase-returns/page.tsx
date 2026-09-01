'use client';

import { useFlatOptions } from '@/hooks/use-options';
import { DocumentPage } from '@/components/tx/document-page';

export default function PurchaseReturnsPage() {
  const { options: supplierOptions } = useFlatOptions('suppliers');
  const { options: locationOptions } = useFlatOptions('stock-locations');

  return (
    <DocumentPage
      config={{
        resource: 'purchase-returns',
        title: 'Purchase Returns',
        description: 'Returns to suppliers that move stock out of your locations.',
        dateField: 'returnDate',
        partyLabel: 'Supplier',
        partyParam: 'supplierId',
        partyOptions: supplierOptions,
        priceKey: 'unitCost',
        itemLineField: 'unitCost',
        locationOptions,
        newLabel: 'Purchase Return',
      }}
    />
  );
}