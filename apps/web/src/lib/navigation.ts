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
} from 'lucide-react';
import { isAllowed } from '@/lib/auth-types';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  permission?: string;
  /** Feature code(s) that must all be enabled for this item to be visible. */
  feature?: string;
  features?: string[];
  /** Only shown to users holding the Developer role. */
  developerOnly?: boolean;
  children?: NavItem[];
}

export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/', icon: Home, permission: 'dashboard.view' },
  {
    label: 'Administration',
    href: '/administration',
    icon: Landmark,
    children: [
      { label: 'Chart of Accounts', href: '/administration/chart-of-accounts', icon: Network, permission: 'administration.head-accounts.view', feature: 'accounts' },
      { label: 'Main Accounts', href: '/administration/main-accounts', icon: Landmark, permission: 'administration.main-accounts.view', feature: 'accounts' },
      { label: 'Item Types', href: '/administration/item-types', icon: Boxes, permission: 'administration.item-types.view', feature: 'inventory' },
      { label: 'Brands', href: '/administration/brands', icon: Building2, permission: 'administration.brands.view', feature: 'inventory' },
      { label: 'Items', href: '/administration/items', icon: Package, permission: 'administration.items.view', feature: 'inventory' },
      { label: 'Stock Locations', href: '/administration/stock-locations', icon: Boxes, permission: 'administration.stock-locations.view', feature: 'inventory' },
    ],
  },
  {
    label: 'Parties',
    href: '/parties',
    icon: Users,
    children: [
      { label: 'Towns', href: '/parties/towns', icon: Building2, permission: 'administration.towns.view', feature: 'parties' },
      { label: 'Customers', href: '/parties/customers', icon: Users, permission: 'administration.customers.view', feature: 'parties' },
      { label: 'Suppliers', href: '/parties/suppliers', icon: Truck, permission: 'administration.suppliers.view', feature: 'parties' },
    ],
  },
  {
    label: 'Sales',
    href: '/sales',
    icon: ShoppingCart,
    children: [
      { label: 'Sales Invoices', href: '/sales/invoices', icon: ShoppingCart, permission: 'sales.invoice.view', feature: 'sales' },
      { label: 'Sales Returns', href: '/sales/returns', icon: Receipt, permission: 'sales.return.view', feature: 'sales' },
    ],
  },
  {
    label: 'Inventory',
    href: '/inventory',
    icon: Package,
    children: [
      { label: 'Purchases', href: '/inventory/purchases', icon: Truck, permission: 'inventory.purchase.view', feature: 'purchases' },
      { label: 'Purchase Returns', href: '/inventory/purchase-returns', icon: Receipt, permission: 'inventory.purchase-return.view', feature: 'purchases' },
      { label: 'Stock Transfers', href: '/inventory/transfers', icon: Truck, permission: 'inventory.transfer.view', feature: 'inventory' },
    ],
  },
  {
    label: 'Accounts',
    href: '/accounts',
    icon: Wallet,
    children: [
      { label: 'Vouchers', href: '/accounts/vouchers', icon: Receipt, permission: 'accounts.vouchers.view', feature: 'accounts' },
      { label: 'Cash Book', href: '/accounts/cash-book', icon: Wallet, permission: 'accounts.cashbook.view', feature: 'accounts' },
    ],
  },
  {
    label: 'Reports',
    href: '/reports',
    icon: FileSpreadsheet,
    children: [
      { label: 'Trial Balance', href: '/reports/trial-balance', icon: BarChart3, permission: 'reports.accounting.view', features: ['reports', 'accounts'] },
      { label: 'General Ledger', href: '/reports/general-ledger', icon: FileSpreadsheet, permission: 'reports.accounting.view', features: ['reports', 'accounts'] },
      { label: 'General Journal', href: '/reports/general-journal', icon: FileSpreadsheet, permission: 'reports.accounting.view', features: ['reports', 'accounts'] },
      { label: 'Stock Report', href: '/reports/stock', icon: Package, permission: 'reports.inventory.view', features: ['reports', 'inventory'] },
      { label: 'Product Ledger', href: '/reports/product-ledger', icon: Package, permission: 'reports.inventory.view', features: ['reports', 'inventory'] },
      { label: 'Sales Book', href: '/reports/sales-book', icon: ShoppingCart, permission: 'reports.sales.view', features: ['reports', 'sales'] },
      { label: 'Purchase Book', href: '/reports/purchase-book', icon: Truck, permission: 'reports.purchase.view', features: ['reports', 'purchases'] },
    ],
  },
  {
    label: 'System',
    href: '/system',
    icon: Settings,
    children: [
      { label: 'Users', href: '/system/users', icon: Users, permission: 'users.view' },
      { label: 'Roles & Permissions', href: '/system/roles', icon: Settings, permission: 'roles.view' },
      { label: 'Audit Logs', href: '/system/audit-logs', icon: FileSpreadsheet, permission: 'system.audit.view', feature: 'audit' },
      { label: 'Settings', href: '/system/settings', icon: Settings, permission: 'system.settings.manage' },
      { label: 'Print Layout', href: '/system/print-layout', icon: Printer, permission: 'system.settings.manage' },
      { label: 'Branding', href: '/system/branding', icon: Building2, permission: 'system.branding.manage' },
      { label: 'Company Features', href: '/system/company-features', icon: Settings, permission: 'system.features.manage', developerOnly: true },
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
  enabledFeatures: Set<string>;
  isDeveloper: boolean;
}

/**
 * Filters the navigation tree by the user's permissions, the company's enabled
 * features and a couple of role-specific items. The Developer role sees every
 * entry so it can always reach the feature switches and verify a configuration.
 */
export const filterNavigation = (items: NavItem[], ctx: NavContext): NavItem[] => {
  // The developer manages features, so it always sees the full navigation.
  if (ctx.isDeveloper) return items;

  return items
    .map((item) => {
      if (item.developerOnly && !ctx.isDeveloper) return null;

      const requiredFeatures = item.features ?? (item.feature ? [item.feature] : []);
      if (requiredFeatures.length > 0 && !requiredFeatures.every((f) => ctx.enabledFeatures.has(f))) {
        return null;
      }

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