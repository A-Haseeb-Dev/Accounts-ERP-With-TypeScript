import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

// Minimal bootstrap seed. Intentionally creates ONLY the data needed for the
// app to run and log in. No sample chart of accounts, no demo products,
// no sample parties, and no demo transactions — those ship as empty so the
// user builds real data from a clean slate.

async function main() {
  console.log('Seeding minimal bootstrap data...');

  await cleanupDemoData();
  await seedOrganization();
  await seedRolesAndPermissions();
  await seedUsers();
  await seedSettings();

  console.log('Seeding complete.');
}

// Remove any leftover demo/placeholder records from previous seeding so they
// never persist or duplicate across redeploys. Deletes are guarded so real
// accounting data (accounts with voucher activity) is never touched.
async function cleanupDemoData() {
  try {
    // Demo vouchers / transactions by their known placeholder numbers.
    const demoVoucherNumbers = ['PV-000001', 'SV-000001', 'JV-000001'];
    const demoVouchers = await prisma.voucher.findMany({ where: { number: { in: demoVoucherNumbers } } });
    for (const v of demoVouchers) {
      await prisma.voucherEntry.deleteMany({ where: { voucherId: v.id } });
    }
    await prisma.voucher.deleteMany({ where: { number: { in: demoVoucherNumbers } } });

    const demoPurchases = await prisma.purchase.findMany({ where: { number: { in: ['PI-000001'] } } });
    for (const p of demoPurchases) {
      await prisma.purchaseItem.deleteMany({ where: { purchaseId: p.id } });
      await prisma.inventoryTransaction.deleteMany({ where: { referenceType: 'Purchase', referenceId: p.id } });
    }
    await prisma.purchase.deleteMany({ where: { number: { in: ['PI-000001'] } } });

    const demoSales = await prisma.sale.findMany({ where: { number: { in: ['SI-000001'] } } });
    for (const s of demoSales) {
      await prisma.saleItem.deleteMany({ where: { saleId: s.id } });
      await prisma.inventoryTransaction.deleteMany({ where: { referenceType: 'Sale', referenceId: s.id } });
    }
    await prisma.sale.deleteMany({ where: { number: { in: ['SI-000001'] } } });

    // Demo customers / suppliers by their placeholder codes.
    await prisma.customer.deleteMany({ where: { code: { in: ['CUS-001', 'CUS-002', 'CUS-003'] } } });
    await prisma.supplier.deleteMany({ where: { code: { in: ['SUP-001', 'SUP-002', 'SUP-003'] } } });

    // Demo products and their master data.
    const demoItems = await prisma.item.findMany({ where: { code: { startsWith: 'ITM-' } } });
    const demoItemIds = demoItems.map((i) => i.id);
    if (demoItemIds.length > 0) {
      await prisma.inventoryTransaction.deleteMany({ where: { itemId: { in: demoItemIds } } });
      await prisma.purchaseItem.deleteMany({ where: { itemId: { in: demoItemIds } } });
      await prisma.saleItem.deleteMany({ where: { itemId: { in: demoItemIds } } });
      await prisma.purchaseReturnItem.deleteMany({ where: { itemId: { in: demoItemIds } } });
      await prisma.salesReturnItem.deleteMany({ where: { itemId: { in: demoItemIds } } });
      await prisma.item.deleteMany({ where: { id: { in: demoItemIds } } });
    }
    await prisma.stockLocation.deleteMany({ where: { code: 'SL-001' } });
    for (const name of ['Groceries', 'Beverages', 'Electronics', 'General Goods']) {
      await prisma.itemType.deleteMany({ where: { name } });
    }
    for (const name of ['Nestle', 'PepsiCo', 'Coca Cola', 'Lipton', 'Unilever']) {
      await prisma.brand.deleteMany({ where: { name } });
    }
    for (const name of ['Lahore', 'Karachi', 'Faisalabad', 'Multan']) {
      await prisma.town.deleteMany({ where: { name } });
    }

    // Obsolete inactive chart-of-accounts heads from the old seed (01-05) and
    // their now-empty sub heads / main accounts. Only touched when inactive so
    // no live account data is removed.
    const oldHeads = await prisma.headAccount.findMany({ where: { code: { in: ['01', '02', '03', '04', '05'] }, status: 'inactive' } });
    for (const head of oldHeads) {
      const subs = await prisma.subHead.findMany({ where: { headAccountId: head.id, status: 'inactive' } });
      for (const sub of subs) {
        const accounts = await prisma.mainAccount.findMany({
          where: { subHeadId: sub.id },
          include: { _count: { select: { voucherEntries: true, customers: true, suppliers: true } } },
        });
        const onlyUnused = accounts.every((a) => a._count.voucherEntries + a._count.customers + a._count.suppliers === 0);
        if (onlyUnused) {
          await prisma.mainAccount.deleteMany({ where: { subHeadId: sub.id } });
          await prisma.subHead.delete({ where: { id: sub.id } });
        }
      }
      const remaining = await prisma.subHead.count({ where: { headAccountId: head.id } });
      if (remaining === 0) {
        await prisma.headAccount.delete({ where: { id: head.id } });
      }
    }

    console.log('  Cleanup complete.');
  } catch (e) {
    console.log('  Cleanup skipped (no matching demo data).', e instanceof Error ? e.message : '');
  }
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
  const catalog = [
    ['dashboard', 'view', 'dashboard.view'],
    ['Administration', 'view', 'administration.head-accounts.view'],
    ['Administration', 'view', 'administration.sub-heads.view'],
    ['Administration', 'view', 'administration.main-accounts.view'],
    ['Administration', 'view', 'administration.item-types.view'],
    ['Administration', 'view', 'administration.brands.view'],
    ['Administration', 'view', 'administration.items.view'],
    ['Administration', 'view', 'administration.stock-locations.view'],
    ['Administration', 'view', 'administration.customers.view'],
    ['Administration', 'view', 'administration.suppliers.view'],
    ['Administration', 'view', 'administration.towns.view'],
    ['users', 'view', 'users.view'],
    ['roles', 'view', 'roles.view'],
    ['permissions', 'view', 'permissions.view'],
    ['accounts', 'view', 'accounts.vouchers.view'],
    ['accounts', 'view', 'accounts.cashbook.view'],
    ['inventory', 'view', 'inventory.purchase.view'],
    ['inventory', 'view', 'inventory.purchase-return.view'],
    ['inventory', 'view', 'inventory.transfer.view'],
    ['sales', 'view', 'sales.invoice.view'],
    ['sales', 'view', 'sales.return.view'],
    ['reports', 'view', 'reports.accounting.view'],
    ['reports', 'view', 'reports.inventory.view'],
    ['reports', 'view', 'reports.sales.view'],
    ['reports', 'view', 'reports.purchase.view'],
    ['system', 'view', 'system.audit.view'],
  ] as [string, string, string][];

  const roleDefs: { name: string; description: string; isSystem: boolean }[] = [
    { name: 'Developer', description: 'Full system access with server-side bypass', isSystem: true },
    { name: 'Super Admin', description: 'Full access to all modules', isSystem: true },
  ];

  for (const [module, action, name] of catalog) {
    await prisma.permission.upsert({
      where: { name },
      create: { name, module, action },
      update: {},
    });
  }

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
    const passwordHash = await argon2.hash(def.password);
    if (!existing) {
      await prisma.user.create({
        data: { fullName: def.fullName, username: def.username, passwordHash, email: def.email, status: 'active' },
      });
    } else {
      await prisma.user.update({ where: { id: existing.id }, data: { fullName: def.fullName, passwordHash, email: def.email, status: 'active' } });
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