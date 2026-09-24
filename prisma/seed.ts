import { PrismaClient } from '@prisma/client';
import { PERMISSION_CATALOG } from '../apps/api/src/permissions/permission-catalog';
const prisma = new PrismaClient();

// Minimal bootstrap seed. Intentionally creates ONLY the data needed for the
// app to run and log in. No sample chart of accounts, no demo products,
// no sample parties, and no demo transactions — those ship as empty so the
// user builds real data from a clean slate.
//
// SAFE BY DESIGN: this seed never hard-deletes user-created records. It only
// upserts system rows (organization, roles, permissions, the two bootstrap
// users, and default settings) and re-links system roles for the bootstrap
// users. Passwords of existing accounts are preserved so re-running the seed
// can never lock anyone out or surprise them with a reset password.

async function main() {
  console.log('Seeding minimal bootstrap data...');

  await seedOrganization();
  await seedRolesAndPermissions();
  await seedUsers();
  await seedSettings();

  console.log('Seeding complete.');
}

async function seedOrganization() {
  await prisma.organization.upsert({
    where: { code: 'default-org' },
    update: { name: 'My Company', shortName: 'MY', isActive: true },
    create: { id: 'default-org', code: 'default-org', name: 'My Company', shortName: 'MY', isActive: true },
  });
  console.log('  Organization ready.');
}

async function seedRolesAndPermissions() {
  const catalog = PERMISSION_CATALOG.map((p) => [p.module, p.action, p.name] as [string, string, string]);

  const roleDefs: { name: string; description: string; isSystem: boolean; protected: boolean }[] = [
    { name: 'Developer', description: 'Full system access with server-side bypass', isSystem: true, protected: true },
    { name: 'Super Admin', description: 'Full access to all modules', isSystem: true, protected: true },
  ];

  // Baseline permission sets for the out-of-the-box operational roles. These are
  // only applied when the role does not exist yet; once a user has tuned a role
  // in the app, the seed never overwrites their changes.
  const customRoleTemplates: { name: string; description: string; perms: string[] }[] = [
    {
      name: 'Accountant',
      description: 'Vouchers, receipts & payments and accounting reports',
      perms: [
        'dashboard.view',
        'accounts.cashbook.view',
        'accounts.vouchers.view', 'accounts.vouchers.create', 'accounts.vouchers.update', 'accounts.vouchers.delete',
        'accounts.vouchers.submit', 'accounts.vouchers.post', 'accounts.vouchers.reject', 'accounts.vouchers.cancel',
        'accounts.payments.view', 'accounts.payments.create', 'accounts.payments.update', 'accounts.payments.delete',
        'accounts.payments.post', 'accounts.payments.cancel', 'accounts.payments.print',
        'administration.customers.view', 'administration.suppliers.view', 'administration.towns.view',
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
        'reports.accounting.view', 'reports.inventory.view', 'reports.sales.view', 'reports.purchase.view', 'reports.print', 'reports.export',
      ],
    },
    {
      name: 'Inventory Manager',
      description: 'Full inventory operations with item master visibility',
      perms: [
        'dashboard.view',
        'administration.items.view', 'administration.items.stock',
        'inventory.purchase.view', 'inventory.purchase.create', 'inventory.purchase.update', 'inventory.purchase.delete',
        'inventory.purchase.submit', 'inventory.purchase.post', 'inventory.purchase.reject', 'inventory.purchase.cancel', 'inventory.purchase.print',
        'inventory.purchase-return.view', 'inventory.purchase-return.create', 'inventory.purchase-return.update', 'inventory.purchase-return.delete',
        'inventory.purchase-return.submit', 'inventory.purchase-return.post', 'inventory.purchase-return.reject', 'inventory.purchase-return.cancel', 'inventory.purchase-return.print',
        'inventory.transfer.view', 'inventory.transfer.create', 'inventory.transfer.update', 'inventory.transfer.delete',
        'inventory.transfer.submit', 'inventory.transfer.post', 'inventory.transfer.reject', 'inventory.transfer.cancel', 'inventory.transfer.print',
        'reports.inventory.view', 'reports.print',
      ],
    },
    {
      name: 'Sales User',
      description: 'Full sales operations with customer and item visibility',
      perms: [
        'dashboard.view',
        'administration.customers.view', 'administration.items.view',
        'sales.invoice.view', 'sales.invoice.create', 'sales.invoice.update', 'sales.invoice.delete',
        'sales.invoice.submit', 'sales.invoice.post', 'sales.invoice.reject', 'sales.invoice.cancel', 'sales.invoice.print',
        'sales.return.view', 'sales.return.create', 'sales.return.update', 'sales.return.delete',
        'sales.return.submit', 'sales.return.post', 'sales.return.reject', 'sales.return.cancel', 'sales.return.print',
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
        'users.view', 'roles.view', 'permissions.view',
      ],
    },
  ];

  for (const [module, action, name] of catalog) {
    await prisma.permission.upsert({
      where: { name },
      create: { name, module, action },
      update: {},
    });
  }

  // Grant Super Admin every catalog permission (kept in sync with the runtime
  // catalog, which the API also reconciles on boot).
  const superAdminPerms = (await prisma.permission.findMany()).map((p) => p.id);

  const roles: Record<string, string> = {};
  for (const role of roleDefs) {
    const existing = await prisma.role.findFirst({ where: { name: role.name } });
    const saved = existing ?? (await prisma.role.create({ data: role }));
    roles[role.name] = saved.id;
  }

  await prisma.rolePermission.deleteMany({ where: { roleId: roles['Super Admin'] } });
  await prisma.rolePermission.createMany({
    data: superAdminPerms.map((permissionId) => ({ roleId: roles['Super Admin'], permissionId })),
    skipDuplicates: true,
  });

  // Create the operational roles once (never overwrite a user's later tuning).
  for (const t of customRoleTemplates) {
    const existing = await prisma.role.findFirst({ where: { name: t.name } });
    if (existing) continue;
    const permRows = await prisma.permission.findMany({
      where: { name: { in: t.perms } },
      select: { id: true },
    });
    const role = await prisma.role.create({
      data: { name: t.name, description: t.description, isSystem: false, protected: false },
    });
    await prisma.rolePermission.createMany({
      data: permRows.map((p) => ({ roleId: role.id, permissionId: p.id })),
      skipDuplicates: true,
    });
    console.log(`  Custom role ${t.name} created with ${permRows.length} permissions.`);
  }

  console.log('  Roles and permissions ready.');
}

async function seedUsers() {
  const argon2 = (await import('argon2')).default;

  const defs = [
    { fullName: 'Developer', username: 'developer', password: 'Developer@123', email: 'developer@has-erp.local', roles: ['Developer', 'Super Admin'] },
    { fullName: 'System Admin', username: 'admin', password: 'Admin@123', email: 'admin@has-erp.local', roles: ['Super Admin'] },
  ];

  for (const def of defs) {
    const existing = await prisma.user.findUnique({ where: { username: def.username } });
    if (!existing) {
      const passwordHash = await argon2.hash(def.password);
      await prisma.user.create({
        data: { fullName: def.fullName, username: def.username, passwordHash, email: def.email, status: 'active' },
      });
    }

    const user = await prisma.user.findUnique({ where: { username: def.username } });
    await prisma.userRole.deleteMany({ where: { userId: user!.id } });
    for (const roleName of def.roles) {
      const role = await prisma.role.findFirst({ where: { name: roleName } });
      if (role) await prisma.userRole.create({ data: { userId: user!.id, roleId: role.id } });
    }
  }
  console.log('  Users ready.');
}

async function seedSettings() {
  const settings = [
    ['currency', 'PKR'],
    ['dateFormat', 'DD/MM/YYYY'],
    ['timezone', 'Asia/Karachi'],
    ['inventory.negative_stock', 'false'],
  ];
  for (const [key, value] of settings) {
    await prisma.systemSetting.upsert({
      where: { key_organizationId: { key, organizationId: 'default-org' } },
      create: { key, value, organizationId: 'default-org' },
      update: { value },
    });
  }
  console.log('  Settings ready.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });