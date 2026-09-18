// Complete catalog of permissions in the system.
// Format: MODULE.ACTION
export const PERMISSION_CATALOG: {
  name: string;
  module: string;
  action: string;
  description?: string;
}[] = [
  // Dashboard
  { name: 'dashboard.view', module: 'dashboard', action: 'view', description: 'View dashboard' },

  // Administration - accounts
  { name: 'administration.head-accounts.view', module: 'Administration', action: 'view', description: 'View head accounts' },
  { name: 'administration.head-accounts.create', module: 'Administration', action: 'create' },
  { name: 'administration.head-accounts.update', module: 'Administration', action: 'update' },
  { name: 'administration.head-accounts.delete', module: 'Administration', action: 'delete' },

  { name: 'administration.sub-heads.view', module: 'Administration', action: 'view' },
  { name: 'administration.sub-heads.create', module: 'Administration', action: 'create' },
  { name: 'administration.sub-heads.update', module: 'Administration', action: 'update' },
  { name: 'administration.sub-heads.delete', module: 'Administration', action: 'delete' },

  { name: 'administration.main-accounts.view', module: 'Administration', action: 'view' },
  { name: 'administration.main-accounts.create', module: 'Administration', action: 'create' },
  { name: 'administration.main-accounts.update', module: 'Administration', action: 'update' },
  { name: 'administration.main-accounts.delete', module: 'Administration', action: 'delete' },

  // Administration - products
  { name: 'administration.item-types.view', module: 'Administration', action: 'view' },
  { name: 'administration.item-types.create', module: 'Administration', action: 'create' },
  { name: 'administration.item-types.update', module: 'Administration', action: 'update' },
  { name: 'administration.item-types.delete', module: 'Administration', action: 'delete' },

  { name: 'administration.brands.view', module: 'Administration', action: 'view' },
  { name: 'administration.brands.create', module: 'Administration', action: 'create' },
  { name: 'administration.brands.update', module: 'Administration', action: 'update' },
  { name: 'administration.brands.delete', module: 'Administration', action: 'delete' },

  { name: 'administration.items.view', module: 'Administration', action: 'view' },
  { name: 'administration.items.create', module: 'Administration', action: 'create' },
  { name: 'administration.items.update', module: 'Administration', action: 'update' },
  { name: 'administration.items.delete', module: 'Administration', action: 'delete' },
  { name: 'administration.items.stock', module: 'Administration', action: 'stock', description: 'View item stock and ledger' },

  { name: 'administration.stock-locations.view', module: 'Administration', action: 'view' },
  { name: 'administration.stock-locations.create', module: 'Administration', action: 'create' },
  { name: 'administration.stock-locations.update', module: 'Administration', action: 'update' },
  { name: 'administration.stock-locations.delete', module: 'Administration', action: 'delete' },

  // Administration - parties
  { name: 'administration.customers.view', module: 'Administration', action: 'view' },
  { name: 'administration.customers.create', module: 'Administration', action: 'create' },
  { name: 'administration.customers.update', module: 'Administration', action: 'update' },
  { name: 'administration.customers.delete', module: 'Administration', action: 'delete' },

  { name: 'administration.suppliers.view', module: 'Administration', action: 'view' },
  { name: 'administration.suppliers.create', module: 'Administration', action: 'create' },
  { name: 'administration.suppliers.update', module: 'Administration', action: 'update' },
  { name: 'administration.suppliers.delete', module: 'Administration', action: 'delete' },

  { name: 'administration.towns.view', module: 'Administration', action: 'view' },
  { name: 'administration.towns.create', module: 'Administration', action: 'create' },
  { name: 'administration.towns.update', module: 'Administration', action: 'update' },
  { name: 'administration.towns.delete', module: 'Administration', action: 'delete' },

  // User management
  { name: 'users.view', module: 'users', action: 'view' },
  { name: 'users.manage', module: 'users', action: 'manage' },
  { name: 'roles.view', module: 'roles', action: 'view' },
  { name: 'roles.manage', module: 'roles', action: 'manage' },
  { name: 'permissions.view', module: 'permissions', action: 'view' },

  // Accounting
  { name: 'accounts.vouchers.view', module: 'accounts', action: 'view' },
  { name: 'accounts.vouchers.create', module: 'accounts', action: 'create' },
  { name: 'accounts.vouchers.update', module: 'accounts', action: 'update' },
  { name: 'accounts.vouchers.delete', module: 'accounts', action: 'delete' },
  { name: 'accounts.vouchers.submit', module: 'accounts', action: 'submit', description: 'Submit a draft voucher for approval' },
  { name: 'accounts.vouchers.post', module: 'accounts', action: 'post' },
  { name: 'accounts.vouchers.reject', module: 'accounts', action: 'reject', description: 'Reject a submitted voucher back to draft' },
  { name: 'accounts.vouchers.cancel', module: 'accounts', action: 'cancel' },
  { name: 'accounts.cashbook.view', module: 'accounts', action: 'view' },

  // Receipts & Payments
  { name: 'accounts.payments.view', module: 'accounts', action: 'view', description: 'View receipts & payments' },
  { name: 'accounts.payments.create', module: 'accounts', action: 'create' },
  { name: 'accounts.payments.update', module: 'accounts', action: 'update' },
  { name: 'accounts.payments.delete', module: 'accounts', action: 'delete' },
  { name: 'accounts.payments.post', module: 'accounts', action: 'post', description: 'Approve/post a receipt or payment' },
  { name: 'accounts.payments.cancel', module: 'accounts', action: 'cancel' },
  { name: 'accounts.payments.print', module: 'accounts', action: 'print', description: 'Print receipts & payments' },

  // Inventory
  { name: 'inventory.purchase.view', module: 'inventory', action: 'view' },
  { name: 'inventory.purchase.create', module: 'inventory', action: 'create' },
  { name: 'inventory.purchase.update', module: 'inventory', action: 'update' },
  { name: 'inventory.purchase.delete', module: 'inventory', action: 'delete' },
  { name: 'inventory.purchase.submit', module: 'inventory', action: 'submit', description: 'Submit a draft purchase for approval' },
  { name: 'inventory.purchase.post', module: 'inventory', action: 'post' },
  { name: 'inventory.purchase.reject', module: 'inventory', action: 'reject', description: 'Reject a submitted purchase back to draft' },
  { name: 'inventory.purchase.cancel', module: 'inventory', action: 'cancel' },
  { name: 'inventory.purchase.print', module: 'inventory', action: 'print', description: 'Print purchase bills' },
  { name: 'inventory.purchase-return.view', module: 'inventory', action: 'view' },
  { name: 'inventory.purchase-return.create', module: 'inventory', action: 'create' },
  { name: 'inventory.purchase-return.update', module: 'inventory', action: 'update' },
  { name: 'inventory.purchase-return.delete', module: 'inventory', action: 'delete' },
  { name: 'inventory.purchase-return.submit', module: 'inventory', action: 'submit', description: 'Submit a draft purchase return for approval' },
  { name: 'inventory.purchase-return.post', module: 'inventory', action: 'post' },
  { name: 'inventory.purchase-return.reject', module: 'inventory', action: 'reject', description: 'Reject a submitted purchase return back to draft' },
  { name: 'inventory.purchase-return.cancel', module: 'inventory', action: 'cancel' },
  { name: 'inventory.purchase-return.print', module: 'inventory', action: 'print', description: 'Print purchase return bills' },
  { name: 'inventory.transfer.view', module: 'inventory', action: 'view' },
  { name: 'inventory.transfer.create', module: 'inventory', action: 'create' },
  { name: 'inventory.transfer.update', module: 'inventory', action: 'update' },
  { name: 'inventory.transfer.delete', module: 'inventory', action: 'delete' },
  { name: 'inventory.transfer.submit', module: 'inventory', action: 'submit', description: 'Submit a draft transfer for approval' },
  { name: 'inventory.transfer.post', module: 'inventory', action: 'post' },
  { name: 'inventory.transfer.reject', module: 'inventory', action: 'reject', description: 'Reject a submitted transfer back to draft' },
  { name: 'inventory.transfer.cancel', module: 'inventory', action: 'cancel' },
  { name: 'inventory.transfer.print', module: 'inventory', action: 'print', description: 'Print stock transfer slips' },

  // Sales
  { name: 'sales.invoice.view', module: 'sales', action: 'view' },
  { name: 'sales.invoice.create', module: 'sales', action: 'create' },
  { name: 'sales.invoice.update', module: 'sales', action: 'update' },
  { name: 'sales.invoice.delete', module: 'sales', action: 'delete' },
  { name: 'sales.invoice.submit', module: 'sales', action: 'submit', description: 'Submit a draft invoice for approval' },
  { name: 'sales.invoice.post', module: 'sales', action: 'post' },
  { name: 'sales.invoice.reject', module: 'sales', action: 'reject', description: 'Reject a submitted invoice back to draft' },
  { name: 'sales.invoice.cancel', module: 'sales', action: 'cancel' },
  { name: 'sales.invoice.print', module: 'sales', action: 'print', description: 'Print sales invoices' },
  { name: 'sales.return.view', module: 'sales', action: 'view' },
  { name: 'sales.return.create', module: 'sales', action: 'create' },
  { name: 'sales.return.update', module: 'sales', action: 'update' },
  { name: 'sales.return.delete', module: 'sales', action: 'delete' },
  { name: 'sales.return.submit', module: 'sales', action: 'submit', description: 'Submit a draft return for approval' },
  { name: 'sales.return.post', module: 'sales', action: 'post' },
  { name: 'sales.return.reject', module: 'sales', action: 'reject', description: 'Reject a submitted return back to draft' },
  { name: 'sales.return.cancel', module: 'sales', action: 'cancel' },
  { name: 'sales.return.print', module: 'sales', action: 'print', description: 'Print sales return notes' },

  // Reports
  { name: 'reports.accounting.view', module: 'reports', action: 'view', description: 'View accounting reports (trial balance, ledgers, journal)' },
  { name: 'reports.inventory.view', module: 'reports', action: 'view', description: 'View inventory reports (stock, product ledger)' },
  { name: 'reports.sales.view', module: 'reports', action: 'view', description: 'View the sales book' },
  { name: 'reports.purchase.view', module: 'reports', action: 'view', description: 'View the purchase book' },
  { name: 'reports.print', module: 'reports', action: 'print', description: 'Print reports' },
  { name: 'reports.export', module: 'reports', action: 'export', description: 'Export reports' },

  // System
  { name: 'system.branding.manage', module: 'system', action: 'manage', description: 'Manage company branding' },
  { name: 'system.settings.manage', module: 'system', action: 'manage', description: 'Manage company settings' },
  { name: 'system.audit.view', module: 'system', action: 'view', description: 'View the audit trail' },
  { name: 'system.audit.purge', module: 'system', action: 'purge', description: 'Purge old audit logs' },
  { name: 'system.features.manage', module: 'system', action: 'manage', description: 'Toggle company features (Developer role only)' },
];
