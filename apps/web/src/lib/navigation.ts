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
} from 'lucide-react';
import { isAllowed } from '@/lib/auth-types';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  permission?: string;
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
    label: 'Accounts',
    href: '/accounts',
    icon: Wallet,
    children: [
      { label: 'Vouchers', href: '/accounts/vouchers', icon: Receipt, permission: 'accounts.vouchers.view' },
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
      { label: 'Users', href: '/system/users', icon: Users, permission: 'users.view' },
      { label: 'Roles & Permissions', href: '/system/roles', icon: Settings, permission: 'roles.view' },
      { label: 'Audit Logs', href: '/system/audit-logs', icon: FileSpreadsheet, permission: 'system.audit.view' },
      { label: 'Settings', href: '/system/settings', icon: Settings, permission: 'system.settings.manage' },
      { label: 'Branding', href: '/system/branding', icon: Building2, permission: 'system.branding.manage' },
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

export const filterByPermissions = (items: NavItem[], permissions: string[]): NavItem[] => {
  return items
    .map((item) => {
      if (item.children) {
        const kids = filterByPermissions(item.children, permissions);
        if (kids.length === 0) return null;
        return { ...item, children: kids };
      }
      if (item.permission && !isAllowed(permissions, item.permission)) return null;
      return item;
    })
    .filter((x): x is NavItem => x !== null);
};