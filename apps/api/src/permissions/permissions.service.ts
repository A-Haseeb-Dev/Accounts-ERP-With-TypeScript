import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// Complete catalog of permissions in the system.
// Format: MODULE.ACTION
export const PERMISSION_CATALOG: { name: string; module: string; action: string; description?: string }[] = [
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
  { name: 'permissions.manage', module: 'permissions', action: 'manage' },

  // Accounting
  { name: 'accounts.vouchers.view', module: 'accounts', action: 'view' },
  { name: 'accounts.vouchers.create', module: 'accounts', action: 'create' },
  { name: 'accounts.vouchers.post', module: 'accounts', action: 'post' },
  { name: 'accounts.vouchers.cancel', module: 'accounts', action: 'cancel' },
  { name: 'accounts.cashbook.view', module: 'accounts', action: 'view' },

  // Inventory
  { name: 'inventory.purchase.view', module: 'inventory', action: 'view' },
  { name: 'inventory.purchase.create', module: 'inventory', action: 'create' },
  { name: 'inventory.purchase.post', module: 'inventory', action: 'post' },
  { name: 'inventory.purchase.cancel', module: 'inventory', action: 'cancel' },
  { name: 'inventory.purchase-return.view', module: 'inventory', action: 'view' },
  { name: 'inventory.purchase-return.create', module: 'inventory', action: 'create' },
  { name: 'inventory.purchase-return.post', module: 'inventory', action: 'post' },
  { name: 'inventory.purchase-return.cancel', module: 'inventory', action: 'cancel' },
  { name: 'inventory.transfer.view', module: 'inventory', action: 'view' },
  { name: 'inventory.transfer.create', module: 'inventory', action: 'create' },
  { name: 'inventory.transfer.post', module: 'inventory', action: 'post' },
  { name: 'inventory.transfer.cancel', module: 'inventory', action: 'cancel' },

  // Sales
  { name: 'sales.invoice.view', module: 'sales', action: 'view' },
  { name: 'sales.invoice.create', module: 'sales', action: 'create' },
  { name: 'sales.invoice.post', module: 'sales', action: 'post' },
  { name: 'sales.invoice.cancel', module: 'sales', action: 'cancel' },
  { name: 'sales.return.view', module: 'sales', action: 'view' },
  { name: 'sales.return.create', module: 'sales', action: 'create' },
  { name: 'sales.return.post', module: 'sales', action: 'post' },
  { name: 'sales.return.cancel', module: 'sales', action: 'cancel' },

  // Reports
  { name: 'reports.accounting.view', module: 'reports', action: 'view' },
  { name: 'reports.inventory.view', module: 'reports', action: 'view' },
  { name: 'reports.sales.view', module: 'reports', action: 'view' },
  { name: 'reports.purchase.view', module: 'reports', action: 'view' },
  { name: 'reports.export', module: 'reports', action: 'export' },

  // System
  { name: 'system.branding.manage', module: 'system', action: 'view' },
  { name: 'system.settings.manage', module: 'system', action: 'view' },
  { name: 'system.audit.view', module: 'system', action: 'view' },
];

@Injectable()
export class PermissionsService implements OnModuleInit {
  private readonly logger = new Logger(PermissionsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.syncCatalog();
  }

  private async syncCatalog() {
    try {
      const existing = await this.prisma.permission.findMany();
      const existingNames = new Set(existing.map((p) => p.name));

      const toCreate = PERMISSION_CATALOG.filter((p) => !existingNames.has(p.name)).map(
        ({ name, module, action, description }) => ({
          name,
          module,
          action,
          description: description ?? null,
        }),
      );

      if (toCreate.length > 0) {
        await this.prisma.permission.createMany({ data: toCreate, skipDuplicates: true });
        this.logger.log(`Synced ${toCreate.length} new permissions`);
      }
    } catch (err) {
      this.logger.error(`Permission sync failed: ${(err as Error).message}`);
    }
  }

  async findAll() {
    return this.prisma.permission.findMany({ orderBy: [{ module: 'asc' }, { name: 'asc' }] });
  }
}