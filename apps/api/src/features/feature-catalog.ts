export interface FeatureDef {
  code: string;
  label: string;
  description: string;
  permissions: string[];
}

/**
 * Switchable company features. A feature controls a set of permissions: when a
 * feature is turned off, the guarded endpoints below it are denied for every
 * user except the Developer role. The developer toggles these switches to sell
 * the product with or without certain modules.
 *
 * Core abilities (dashboard, users, roles, settings, branding, print design)
 * are intentionally not switchable so a customer can always administer the ERP.
 */
export const FEATURES: FeatureDef[] = [
  {
    code: 'sales',
    label: 'Sales',
    description: 'Sales invoices, sales returns and their printing.',
    permissions: [
      'sales.invoice.view',
      'sales.invoice.create',
      'sales.invoice.post',
      'sales.invoice.cancel',
      'sales.invoice.print',
      'sales.return.view',
      'sales.return.create',
      'sales.return.post',
      'sales.return.cancel',
      'sales.return.print',
    ],
  },
  {
    code: 'purchases',
    label: 'Purchases',
    description: 'Purchase bills, purchase returns and their printing.',
    permissions: [
      'inventory.purchase.view',
      'inventory.purchase.create',
      'inventory.purchase.post',
      'inventory.purchase.cancel',
      'inventory.purchase.print',
      'inventory.purchase-return.view',
      'inventory.purchase-return.create',
      'inventory.purchase-return.post',
      'inventory.purchase-return.cancel',
      'inventory.purchase-return.print',
    ],
  },
  {
    code: 'inventory',
    label: 'Inventory & Items',
    description: 'Items, item types, brands, stock locations and stock transfers.',
    permissions: [
      'administration.items.view',
      'administration.items.create',
      'administration.items.update',
      'administration.items.delete',
      'administration.items.stock',
      'administration.item-types.view',
      'administration.item-types.create',
      'administration.item-types.update',
      'administration.item-types.delete',
      'administration.brands.view',
      'administration.brands.create',
      'administration.brands.update',
      'administration.brands.delete',
      'administration.stock-locations.view',
      'administration.stock-locations.create',
      'administration.stock-locations.update',
      'administration.stock-locations.delete',
      'inventory.transfer.view',
      'inventory.transfer.create',
      'inventory.transfer.post',
      'inventory.transfer.cancel',
      'inventory.transfer.print',
    ],
  },
  {
    code: 'parties',
    label: 'Parties',
    description: 'Customers, suppliers and towns.',
    permissions: [
      'administration.customers.view',
      'administration.customers.create',
      'administration.customers.update',
      'administration.customers.delete',
      'administration.suppliers.view',
      'administration.suppliers.create',
      'administration.suppliers.update',
      'administration.suppliers.delete',
      'administration.towns.view',
      'administration.towns.create',
      'administration.towns.update',
      'administration.towns.delete',
    ],
  },
  {
    code: 'accounts',
    label: 'Accounting',
    description: 'Chart of accounts, main accounts, vouchers and the cash book.',
    permissions: [
      'administration.head-accounts.view',
      'administration.head-accounts.create',
      'administration.head-accounts.update',
      'administration.head-accounts.delete',
      'administration.sub-heads.view',
      'administration.sub-heads.create',
      'administration.sub-heads.update',
      'administration.sub-heads.delete',
      'administration.main-accounts.view',
      'administration.main-accounts.create',
      'administration.main-accounts.update',
      'administration.main-accounts.delete',
      'accounts.vouchers.view',
      'accounts.vouchers.create',
      'accounts.vouchers.update',
      'accounts.vouchers.delete',
      'accounts.vouchers.post',
      'accounts.vouchers.cancel',
      'accounts.cashbook.view',
    ],
  },
  {
    code: 'reports',
    label: 'Reports',
    description: 'Trial balance, general ledger, journal, stock and the sales/purchase books.',
    permissions: [
      'reports.accounting.view',
      'reports.inventory.view',
      'reports.sales.view',
      'reports.purchase.view',
      'reports.print',
      'reports.export',
    ],
  },
  {
    code: 'audit',
    label: 'Audit Logs',
    description: 'Viewing and purging the audit trail.',
    permissions: ['system.audit.view', 'system.audit.purge'],
  },
];

const PERMISSION_TO_FEATURE: Record<string, string> = {};
for (const feature of FEATURES) {
  for (const permission of feature.permissions) {
    PERMISSION_TO_FEATURE[permission] = feature.code;
  }
}

/** Returns the feature code that owns the given permission, if any. */
export function featureForPermission(permission: string): string | undefined {
  return PERMISSION_TO_FEATURE[permission];
}