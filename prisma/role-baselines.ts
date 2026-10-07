import { PERMISSION_CATALOG } from '../apps/api/src/permissions/permission-catalog';

export interface RoleBaseline {
  name: string;
  description: string;
  perms: string[];
}

/**
 * Baseline permission sets for the out-of-the-box operational roles.
 *
 * The seed applies these only when the role does not exist yet, so a company
 * that has tuned a role in the app is never overwritten.
 * `sync-role-permissions.ts` uses the same list to *add* any permission a role
 * is missing after the catalog grows — it never removes anything.
 */
export const ROLE_BASELINES: RoleBaseline[] = [
  {
    name: 'Accountant',
    description: 'Vouchers, receipts & payments and accounting reports',
    perms: [
      'dashboard.view',
      'accounts.cashbook.view',
      'accounts.vouchers.view', 'accounts.vouchers.create', 'accounts.vouchers.update', 'accounts.vouchers.delete',
      'accounts.vouchers.submit', 'accounts.vouchers.post', 'accounts.vouchers.reject', 'accounts.vouchers.cancel',
      'accounts.payments.view', 'accounts.payments.create', 'accounts.payments.update', 'accounts.payments.delete',
      'accounts.payments.post', 'accounts.payments.cancel', 'accounts.payments.print', 'accounts.payments.export',
      'administration.customers.view', 'administration.suppliers.view', 'administration.towns.view',
      'administration.customers.export', 'administration.suppliers.export',
      'reports.accounting.view', 'reports.print', 'reports.export',
    ],
  },
  {
    name: 'Administrator',
    description: 'Full administration of masters, reports and accounting read-only',
    perms: [
      'dashboard.view',
      'accounts.vouchers.view', 'accounts.payments.view', 'accounts.cashbook.view',
      'administration.head-accounts.view', 'administration.head-accounts.create', 'administration.head-accounts.update', 'administration.head-accounts.delete',
      'administration.sub-heads.view', 'administration.sub-heads.create', 'administration.sub-heads.update', 'administration.sub-heads.delete',
      'administration.main-accounts.view', 'administration.main-accounts.create', 'administration.main-accounts.update', 'administration.main-accounts.delete',
      'administration.item-types.view', 'administration.item-types.create', 'administration.item-types.update', 'administration.item-types.delete',
      'administration.brands.view', 'administration.brands.create', 'administration.brands.update', 'administration.brands.delete',
      'administration.items.view', 'administration.items.create', 'administration.items.update', 'administration.items.delete', 'administration.items.stock',
      'administration.stock-locations.view', 'administration.stock-locations.create', 'administration.stock-locations.update', 'administration.stock-locations.delete',
      'administration.customers.view', 'administration.customers.create', 'administration.customers.update', 'administration.customers.delete',
      'administration.suppliers.view', 'administration.suppliers.create', 'administration.suppliers.update', 'administration.suppliers.delete',
      'administration.towns.view', 'administration.towns.create', 'administration.towns.update', 'administration.towns.delete',
      'administration.main-accounts.export', 'administration.items.export',
      'administration.customers.export', 'administration.suppliers.export',
      'reports.accounting.view', 'reports.inventory.view', 'reports.sales.view', 'reports.purchase.view', 'reports.print', 'reports.export',
    ],
  },
  {
    name: 'Inventory Manager',
    description: 'Full inventory operations with item master visibility',
    perms: [
      'dashboard.view',
      'administration.items.view', 'administration.items.stock', 'administration.items.export',
      'inventory.purchase.view', 'inventory.purchase.create', 'inventory.purchase.update', 'inventory.purchase.delete',
      'inventory.purchase.submit', 'inventory.purchase.post', 'inventory.purchase.reject', 'inventory.purchase.cancel', 'inventory.purchase.print', 'inventory.purchase.export',
      'inventory.purchase-return.view', 'inventory.purchase-return.create', 'inventory.purchase-return.update', 'inventory.purchase-return.delete',
      'inventory.purchase-return.submit', 'inventory.purchase-return.post', 'inventory.purchase-return.reject', 'inventory.purchase-return.cancel', 'inventory.purchase-return.print', 'inventory.purchase-return.export',
      'inventory.transfer.view', 'inventory.transfer.create', 'inventory.transfer.update', 'inventory.transfer.delete',
      'inventory.transfer.submit', 'inventory.transfer.post', 'inventory.transfer.reject', 'inventory.transfer.cancel', 'inventory.transfer.print', 'inventory.transfer.export',
      'reports.inventory.view', 'reports.print',
    ],
  },
  {
    name: 'Sales User',
    description: 'Full sales operations with customer and item visibility',
    perms: [
      'dashboard.view',
      'administration.customers.view', 'administration.customers.export', 'administration.items.view',
      'sales.invoice.view', 'sales.invoice.create', 'sales.invoice.update', 'sales.invoice.delete',
      'sales.invoice.submit', 'sales.invoice.post', 'sales.invoice.reject', 'sales.invoice.cancel', 'sales.invoice.print', 'sales.invoice.export',
      'sales.return.view', 'sales.return.create', 'sales.return.update', 'sales.return.delete',
      'sales.return.submit', 'sales.return.post', 'sales.return.reject', 'sales.return.cancel', 'sales.return.print', 'sales.return.export',
      'sales.quotation.view', 'sales.quotation.print', 'sales.quotation.export',
      'reports.sales.view', 'reports.print',
    ],
  },
  {
    name: 'Viewer',
    description: 'Read-only access across all modules',
    perms: [
      'dashboard.view',
      'administration.head-accounts.view', 'administration.sub-heads.view', 'administration.main-accounts.view',
      'administration.item-types.view', 'administration.brands.view', 'administration.items.view', 'administration.stock-locations.view',
      'administration.customers.view', 'administration.suppliers.view', 'administration.towns.view',
      'hr.departments.view', 'hr.designations.view', 'hr.employees.view', 'hr.attendance.view', 'hr.leaves.view',
      'hr.salary-components.view', 'hr.loans.view', 'hr.payroll.view',
      'inventory.purchase.view', 'inventory.purchase-return.view', 'inventory.transfer.view',
      'sales.invoice.view', 'sales.return.view',
      'accounts.vouchers.view', 'accounts.cashbook.view', 'accounts.payments.view',
      'reports.accounting.view', 'reports.inventory.view', 'reports.sales.view', 'reports.purchase.view', 'reports.hr.view',
      'system.audit.view',
      'system.terms.manage',
      'users.view', 'roles.view', 'permissions.view', 'permissions.manage',
    ],
  },
];

/** Fails loudly if a baseline names a permission the catalog does not define. */
export function assertBaselinesMatchCatalog(): string[] {
  const known = new Set(PERMISSION_CATALOG.map((p) => p.name));
  const unknown = new Set<string>();
  for (const role of ROLE_BASELINES) {
    for (const perm of role.perms) {
      if (!known.has(perm)) unknown.add(`${role.name}: ${perm}`);
    }
  }
  return [...unknown];
}