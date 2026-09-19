import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  Building2,
  FileSpreadsheet,
  Home,
  Landmark,
  Package,
  Receipt,
  Settings,
  ShoppingCart,
  Truck,
  Users,
  Wallet,
  Boxes,
  Network,
  Printer,
  ShieldCheck,
  Briefcase,
  CalendarCheck2,
  ClipboardList,
  UserRound,
  WalletCards,
} from 'lucide-react';
import { isAllowed } from '@/lib/auth-types';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  permission?: string;
  /** Only shown to users holding the Developer or Super Admin role. */
  systemAdminOnly?: boolean;
  children?: NavItem[];
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/', icon: Home, permission: 'dashboard.view' },
  {
    label: 'Administration',
    href: '/administration',
    icon: Landmark,
    children: [
      { label: 'Chart of Accounts', href: '/administration/chart-of-accounts', icon: Network, permission: 'administration.head-accounts.view' },
      { label: 'Main Accounts', href: '/administration/main-accounts', icon: Landmark, permission: 'administration.main-accounts.view' },
      { label: 'Bank Accounts', href: '/administration/banks', icon: Landmark, permission: 'administration.main-accounts.view' },
      { label: 'Item Types', href: '/administration/item-types', icon: Boxes, permission: 'administration.item-types.view' },
      { label: 'Brands', href: '/administration/brands', icon: Building2, permission: 'administration.brands.view' },
      { label: 'Items', href: '/administration/items', icon: Package, permission: 'administration.items.view' },
      { label: 'Stock Locations', href: '/administration/stock-locations', icon: Boxes, permission: 'administration.stock-locations.view' },
    ],
  },
  {
    label: 'Parties',
    href: '/parties',
    icon: Users,
    children: [
      { label: 'Towns', href: '/parties/towns', icon: Building2, permission: 'administration.towns.view' },
      { label: 'Customers', href: '/parties/customers', icon: Users, permission: 'administration.customers.view' },
      { label: 'Suppliers', href: '/parties/suppliers', icon: Truck, permission: 'administration.suppliers.view' },
    ],
  },
  {
    label: 'Sales',
    href: '/sales',
    icon: ShoppingCart,
    children: [
      { label: 'Sales Invoices', href: '/sales/invoices', icon: ShoppingCart, permission: 'sales.invoice.view' },
      { label: 'Sales Returns', href: '/sales/returns', icon: Receipt, permission: 'sales.return.view' },
    ],
  },
  {
    label: 'Inventory',
    href: '/inventory',
    icon: Package,
    children: [
      { label: 'Purchases', href: '/inventory/purchases', icon: Truck, permission: 'inventory.purchase.view' },
      { label: 'Purchase Returns', href: '/inventory/purchase-returns', icon: Receipt, permission: 'inventory.purchase-return.view' },
      { label: 'Stock Transfers', href: '/inventory/transfers', icon: Truck, permission: 'inventory.transfer.view' },
    ],
  },
  {
    label: 'HR & Payroll',
    href: '/hr',
    icon: Briefcase,
    children: [
      { label: 'Employees', href: '/hr/employees', icon: UserRound, permission: 'hr.employees.view' },
      { label: 'Attendance', href: '/hr/attendance', icon: CalendarCheck2, permission: 'hr.attendance.view' },
      { label: 'Leaves', href: '/hr/leaves', icon: ClipboardList, permission: 'hr.leaves.view' },
      { label: 'Departments', href: '/hr/departments', icon: Briefcase, permission: 'hr.departments.view' },
      { label: 'Designations', href: '/hr/designations', icon: Briefcase, permission: 'hr.designations.view' },
      { label: 'Payroll', href: '/hr/payroll', icon: WalletCards, permission: 'hr.payroll.view' },
    ],
  },
  {
    label: 'Accounts',
    href: '/accounts',
    icon: Wallet,
    children: [
      { label: 'Vouchers', href: '/accounts/vouchers', icon: Receipt, permission: 'accounts.vouchers.view' },
      { label: 'Receipts & Payments', href: '/accounts/payments', icon: Wallet, permission: 'accounts.payments.view' },
      { label: 'Cheques Register', href: '/accounts/cheques', icon: Receipt, permission: 'accounts.payments.view' },
      { label: 'Cash Book', href: '/accounts/cash-book', icon: Wallet, permission: 'accounts.cashbook.view' },
    ],
  },
  {
    label: 'Reports',
    href: '/reports',
    icon: FileSpreadsheet,
    children: [
      { label: 'Trial Balance', href: '/reports/trial-balance', icon: BarChart3, permission: 'reports.accounting.view' },
      { label: 'General Ledger', href: '/reports/general-ledger', icon: FileSpreadsheet, permission: 'reports.accounting.view' },
      { label: 'General Journal', href: '/reports/general-journal', icon: FileSpreadsheet, permission: 'reports.accounting.view' },
      { label: 'Stock Report', href: '/reports/stock', icon: Package, permission: 'reports.inventory.view' },
      { label: 'Product Ledger', href: '/reports/product-ledger', icon: Package, permission: 'reports.inventory.view' },
      { label: 'Sales Book', href: '/reports/sales-book', icon: ShoppingCart, permission: 'reports.sales.view' },
      { label: 'Purchase Book', href: '/reports/purchase-book', icon: Truck, permission: 'reports.purchase.view' },
    ],
  },
  {
    label: 'System',
    href: '/system',
    icon: Settings,
    children: [
      { label: 'Users', href: '/system/users', icon: Users, permission: 'users.view', systemAdminOnly: true },
      { label: 'Roles & Permissions', href: '/system/roles', icon: Settings, permission: 'roles.view', systemAdminOnly: true },
      { label: 'Audit Logs', href: '/system/audit-logs', icon: FileSpreadsheet, permission: 'system.audit.view', systemAdminOnly: true },
      { label: 'Settings', href: '/system/settings', icon: Settings, permission: 'system.settings.manage', systemAdminOnly: true },
      { label: 'Security', href: '/system/security', icon: ShieldCheck, permission: 'system.settings.manage', systemAdminOnly: true },
      { label: 'Print Layout', href: '/system/print-layout', icon: Printer, permission: 'system.settings.manage', systemAdminOnly: true },
      { label: 'Branding', href: '/system/branding', icon: Building2, permission: 'system.branding.manage', systemAdminOnly: true },
      { label: 'Company Features', href: '/system/company-features', icon: Settings, permission: 'system.features.manage', systemAdminOnly: true },
    ],
  },
];

export const flattenNav = (items: NavItem[]): NavItem[] => {
  const out: NavItem[] = [];
  for (const item of items) {
    if (item.children) out.push(...flattenNav(item.children));
    else out.push(item);
  }
  return out;
};

export interface NavContext {
  permissions: string[];
  /** Feature codes (== permission names) that the developer has switched off. */
  disabledFeatures: Set<string>;
  isDeveloper: boolean;
  /** Holds the Developer or Super Admin role. */
  isSystemAdmin: boolean;
}

/**
 * Filters the navigation tree by the user's permissions, the company's disabled
 * features and a couple of role-specific items. The Developer role sees every
 * entry so it can always reach the feature switches and verify a configuration.
 * System-management pages are only shown to Developer or Super Admin.
 */
export const filterNavigation = (items: NavItem[], ctx: NavContext): NavItem[] => {
  // The developer manages features, so it always sees the full navigation.
  if (ctx.isDeveloper) return items;

  return items
    .map((item) => {
      // System-management pages (users, roles, audit, settings, branding,
      // company features…) are only reachable by the Developer or Super Admin.
      if (item.systemAdminOnly && !ctx.isSystemAdmin) return null;

      // A page whose view permission has been switched off is hidden.
      if (item.permission && ctx.disabledFeatures.has(item.permission)) return null;

      if (item.children) {
        const kids = filterNavigation(item.children, ctx);
        if (kids.length === 0) return null;
        return { ...item, children: kids };
      }
      if (item.permission && !isAllowed(ctx.permissions, item.permission)) return null;
      return item;
    })
    .filter((x): x is NavItem => x !== null);
};
