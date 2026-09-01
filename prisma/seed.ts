import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('Seeding HAS ERP development data...');

  await seedOrganization();
  await seedRolesAndPermissions();
  await seedUsers();
  await seedMasterData();
  await seedParties();
  await seedDefaults();
  await seedTransactions();

  console.log('Seeding complete.');
}

async function seedOrganization() {
  await prisma.organization.upsert({
    where: { code: 'default-org' },
    update: { name: 'HAS ERP', shortName: 'HAS', isActive: true },
    create: { id: 'default-org', code: 'default-org', name: 'HAS ERP', shortName: 'HAS', isActive: true },
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
    { name: 'Administrator', description: 'Manages administration and settings', isSystem: false },
    { name: 'Accountant', description: 'Manage vouchers and accounting reports', isSystem: false },
    { name: 'Inventory Manager', description: 'Manage purchases and inventory', isSystem: false },
    { name: 'Sales User', description: 'Create and manage sales invoices', isSystem: false },
    { name: 'Viewer', description: 'Read-only access to most modules', isSystem: false },
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

  // Super Admin gets every permission.
  await prisma.rolePermission.deleteMany({ where: { roleId: roles['Super Admin'] } });
  await prisma.rolePermission.createMany({
    data: superAdminPerms.map((permissionId) => ({ roleId: roles['Super Admin'], permissionId })),
    skipDuplicates: true,
  });

  // Viewer gets all view permissions.
  const viewPerms = (await prisma.permission.findMany({ where: { action: 'view' } })).map((p) => p.id);
  await prisma.rolePermission.deleteMany({ where: { roleId: roles['Viewer'] } });
  await prisma.rolePermission.createMany({
    data: viewPerms.map((permissionId) => ({ roleId: roles['Viewer'], permissionId })),
    skipDuplicates: true,
  });

  console.log('  Roles and permissions ready.');
}

async function seedUsers() {
  const argon2 = (await import('argon2')).default;

  const defs = [
    { fullName: 'Developer', username: 'developer', password: 'Developer@123', email: 'developer@has-erp.local', roles: ['Developer', 'Super Admin'] },
    { fullName: 'System Admin', username: 'admin', password: 'Admin@123', email: 'admin@has-erp.local', roles: ['Super Admin', 'Administrator'] },
    { fullName: 'Chief Accountant', username: 'accountant', password: 'Accountant@123', email: 'accountant@has-erp.local', roles: ['Accountant'] },
    { fullName: 'Sales Officer', username: 'sales', password: 'Sales@123', email: 'sales@has-erp.local', roles: ['Sales User'] },
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

async function seedMasterData() {
  const heads = [
    { code: '01', name: 'Assets' },
    { code: '02', name: 'Liabilities' },
    { code: '03', name: 'Equity' },
    { code: '04', name: 'Revenue' },
    { code: '05', name: 'Expenses' },
  ];
  for (const h of heads) {
    await prisma.headAccount.upsert({ where: { code: h.code }, create: { code: h.code, name: h.name, status: 'active' }, update: { name: h.name } });
  }

  const subHeads: { code: string; name: string; headCode: string }[] = [
    { code: '01', name: 'Current Assets', headCode: '01' },
    { code: '02', name: 'Fixed Assets', headCode: '01' },
    { code: '01', name: 'Current Liabilities', headCode: '02' },
    { code: '02', name: 'Long Term Liabilities', headCode: '02' },
    { code: '01', name: 'Capital', headCode: '03' },
    { code: '01', name: 'Direct Revenue', headCode: '04' },
    { code: '01', name: 'Operating Expenses', headCode: '05' },
    { code: '02', name: 'Cost of Sales', headCode: '05' },
  ];
  const subHeadIds: Record<string, string> = {};
  for (const s of subHeads) {
    const head = await prisma.headAccount.findUnique({ where: { code: s.headCode } });
    const existing = await prisma.subHead.findFirst({ where: { code: s.code, headAccountId: head!.id } });
    const subHead = existing ?? (await prisma.subHead.create({ data: { code: s.code, name: s.name, headAccountId: head!.id, status: 'active' } }));
    subHeadIds[`${s.headCode}-${s.code}`] = subHead.id;
  }

  const accounts: { code: string; name: string; subHead: string; type: string }[] = [
    { code: '01-01', name: 'Cash Account', subHead: '01-01', type: 'ASSET' },
    { code: '01-02', name: 'Bank Account', subHead: '01-01', type: 'ASSET' },
    { code: '01-03', name: 'Accounts Receivable', subHead: '01-01', type: 'ASSET' },
    { code: '01-04', name: 'Inventory', subHead: '01-01', type: 'ASSET' },
    { code: '02-01', name: 'Accounts Payable', subHead: '02-01', type: 'LIABILITY' },
    { code: '02-02', name: 'Sales Tax Payable', subHead: '02-01', type: 'LIABILITY' },
    { code: '03-01', name: 'Opening Equity', subHead: '03-01', type: 'EQUITY' },
    { code: '03-02', name: 'Owner Capital', subHead: '03-01', type: 'EQUITY' },
    { code: '04-01', name: 'Sales Revenue', subHead: '04-01', type: 'REVENUE' },
    { code: '04-02', name: 'Sales Returns', subHead: '04-01', type: 'REVENUE' },
    { code: '05-01', name: 'Purchases', subHead: '05-02', type: 'EXPENSE' },
    { code: '05-02', name: 'Purchase Returns', subHead: '05-02', type: 'EXPENSE' },
  ];
  const accountIds: Record<string, string> = {};
  for (const a of accounts) {
    const subHead = subHeadIds[a.subHead];
    const existing = await prisma.mainAccount.findFirst({ where: { code: a.code } });
    const acc = existing ?? (await prisma.mainAccount.create({
      data: { code: a.code, name: a.name, accountType: a.type, subHeadId: subHead, status: 'active' },
    }));
    if (existing && existing.name !== a.name) {
      await prisma.mainAccount.update({ where: { id: existing.id }, data: { name: a.name } });
      acc.name = a.name;
    }
    accountIds[a.code] = acc.id;
  }

  // Base settings
  const settings = [
    ['accounting.cash_account', accountIds['01-01']],
    ['accounting.receivable_account', accountIds['01-03']],
    ['accounting.inventory_account', accountIds['01-04']],
    ['accounting.payable_account', accountIds['02-01']],
    ['accounting.tax_account', accountIds['02-02']],
    ['accounting.revenue_account', accountIds['04-01']],
    ['accounting.sales_return_account', accountIds['04-02']],
    ['accounting.purchase_return_account', accountIds['05-02']],
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

  // Branding
  const existingBranding = await prisma.brandingSetting.findFirst();
  if (!existingBranding) {
    await prisma.brandingSetting.create({
      data: { businessName: 'HAS ERP', shortName: 'HAS', primaryColor: '#2563eb', secondaryColor: '#0f172a' },
    });
  }

  console.log('  Master data ready.');
}

async function seedParties() {
  const towns = ['Lahore', 'Karachi', 'Faisalabad', 'Multan'];
  const townIds: Record<string, string> = {};
  for (const t of towns) {
    const existing = await prisma.town.findFirst({ where: { name: t } });
    const town = existing ?? (await prisma.town.create({ data: { name: t, city: t, status: 'active' } }));
    townIds[t] = town.id;
  }

  const itemTypes = ['Groceries', 'Beverages', 'Electronics', 'General Goods'];
  const itemTypeIds: Record<string, string> = {};
  for (const it of itemTypes) {
    const existing = await prisma.itemType.findFirst({ where: { name: it } });
    const saved = existing ?? (await prisma.itemType.create({ data: { name: it, status: 'active' } }));
    itemTypeIds[it] = saved.id;
  }

  const brands = ['Nestle', 'PepsiCo', 'Coca Cola', 'Lipton', 'Unilever'];
  const brandIds: Record<string, string> = {};
  for (const b of brands) {
    const existing = await prisma.brand.findFirst({ where: { name: b } });
    const saved = existing ?? (await prisma.brand.create({ data: { name: b, status: 'active' } }));
    brandIds[b] = saved.id;
  }

  const location = await prisma.stockLocation.findFirst();
  const locationId = location?.id ?? (await prisma.stockLocation.create({ data: { code: 'SL-001', name: 'Main Store', status: 'active' } })).id;
  const mainStoreSettings = await prisma.systemSetting.findFirst({ where: { key: 'defaults.stockLocationId' } });
  if (!mainStoreSettings) {
    await prisma.systemSetting.create({ data: { key: 'defaults.stockLocationId', value: locationId, organizationId: 'default-org' } });
  }

  const items: { code: string; name: string; unit: string; pp: number; sp: number; type: string; brand: string }[] = [
    { code: 'ITM-001', name: 'Coca Cola 500ml', unit: 'bottle', pp: 60, sp: 90, type: 'Beverages', brand: 'Coca Cola' },
    { code: 'ITM-002', name: 'Nestle Milk Pack 1L', unit: 'pack', pp: 180, sp: 220, type: 'Groceries', brand: 'Nestle' },
    { code: 'ITM-003', name: 'Pepsi 1.5L', unit: 'bottle', pp: 145, sp: 200, type: 'Beverages', brand: 'PepsiCo' },
    { code: 'ITM-004', name: 'Lipton Yellow Label 250g', unit: 'pack', pp: 320, sp: 400, type: 'Groceries', brand: 'Lipton' },
    { code: 'ITM-005', name: 'Lux Soap 100g', unit: 'pcs', pp: 95, sp: 130, type: 'General Goods', brand: 'Unilever' },
  ];
  const receivableAccount = await prisma.mainAccount.findFirst({ where: { code: '01-03' } });
  const payableAccount = await prisma.mainAccount.findFirst({ where: { code: '02-01' } });

  for (const i of items) {
    const existing = await prisma.item.findUnique({ where: { code: i.code } });
    if (!existing) {
      await prisma.item.create({
        data: {
          code: i.code, name: i.name, unit: i.unit,
          purchasePrice: i.pp, salePrice: i.sp,
          itemTypeId: itemTypeIds[i.type],
          brandId: brandIds[i.brand],
          defaultLocationId: locationId,
          minStockLevel: 10,
          status: 'active',
        },
      });
    }
  }

  const customers = [
    { code: 'CUS-001', name: 'Ahmed Traders', town: 'Lahore', phone: '03001234567' },
    { code: 'CUS-002', name: 'Raza Store', town: 'Karachi', phone: '03001234568' },
    { code: 'CUS-003', name: 'Bilal General Store', town: 'Faisalabad', phone: '03001234569' },
  ];
  for (const c of customers) {
    const existing = await prisma.customer.findUnique({ where: { code: c.code } });
    if (!existing) {
      await prisma.customer.create({
        data: { code: c.code, name: c.name, phone: c.phone, townId: townIds[c.town], mainAccountId: receivableAccount!.id, creditLimit: 100000, status: 'active' },
      });
    }
  }

  const suppliers = [
    { code: 'SUP-001', name: 'National Distributors', town: 'Lahore', phone: '03002345678' },
    { code: 'SUP-002', name: 'City Wholesale', town: 'Karachi', phone: '03002345679' },
    { code: 'SUP-003', name: 'Metro Supply Co', town: 'Multan', phone: '03002345680' },
  ];
  for (const s of suppliers) {
    const existing = await prisma.supplier.findUnique({ where: { code: s.code } });
    if (!existing) {
      await prisma.supplier.create({
        data: { code: s.code, name: s.name, phone: s.phone, townId: townIds[s.town], mainAccountId: payableAccount!.id, status: 'active' },
      });
    }
  }

  console.log('  Parties and products ready.');
}

async function seedDefaults() {
  const developer = await prisma.user.findUnique({ where: { username: 'developer' } });
  if (developer) {
    const resp = await prisma.userRole.findFirst({ where: { userId: developer.id, role: { name: 'Developer' } } });
    if (!resp) {
      const role = await prisma.role.findFirst({ where: { name: 'Developer' } });
      if (role) await prisma.userRole.create({ data: { userId: developer.id, roleId: role.id } });
    }
  }
  console.log('  Defaults ready.');
}

async function seedTransactions() {
  const admin = await prisma.user.findUnique({ where: { username: 'developer' } });
  const location = await prisma.stockLocation.findFirst();
  const supplier1 = await prisma.supplier.findFirst({ where: { code: 'SUP-001' } });
  const customer1 = await prisma.customer.findFirst({ where: { code: 'CUS-001' } });
  const cashAccount = await prisma.mainAccount.findFirst({ where: { code: '01-01' } });
  const capitalAccount = await prisma.mainAccount.findFirst({ where: { code: '03-01' } });

  if (!admin || !location || !supplier1 || !customer1 || !cashAccount || !capitalAccount) {
    console.log('  Skipping transactions: prerequisites missing.');
    return;
  }

  const existingPurchase = await prisma.purchase.findFirst({ where: { number: 'PI-000001' } });
  if (!existingPurchase) {
    const cola = await prisma.item.findUnique({ where: { code: 'ITM-001' } });
    const milk = await prisma.item.findUnique({ where: { code: 'ITM-002' } });
    if (cola && milk) {
      const purchase = await prisma.purchase.create({
        data: {
          number: 'PI-000001',
          purchaseDate: new Date(),
          supplierId: supplier1.id,
          stockLocationId: location.id,
          subtotal: 1000 * 60 + 500 * 180,
          discount: 0,
          tax: 0,
          grandTotal: 1000 * 60 + 500 * 180,
          status: 'posted',
          postedById: admin.id,
          postedAt: new Date(),
          createdById: admin.id,
          items: {
            create: [
              { itemId: cola.id, quantity: 1000, unitCost: 60, discount: 0, tax: 0, lineTotal: 60000 },
              { itemId: milk.id, quantity: 500, unitCost: 180, discount: 0, tax: 0, lineTotal: 90000 },
            ],
          },
        },
      });
      await prisma.inventoryTransaction.create({
        data: { itemId: cola.id, locationId: location.id, transactionType: 'PURCHASE', referenceType: 'Purchase', referenceId: purchase.id, quantityIn: 1000, quantityOut: 0, balance: 1000, unitCost: 60 },
      });
      await prisma.inventoryTransaction.create({
        data: { itemId: milk.id, locationId: location.id, transactionType: 'PURCHASE', referenceType: 'Purchase', referenceId: purchase.id, quantityIn: 500, quantityOut: 0, balance: 500, unitCost: 180 },
      });
      await prisma.voucher.create({
        data: {
          number: 'PV-000001', voucherType: 'CREDIT', voucherDate: new Date(), status: 'posted',
          totalDebit: 150000, totalCredit: 150000,
          description: 'Purchase PI-000001 - National Distributors', reference: 'PI-000001', createdById: admin.id,
          entries: {
            create: [
              { mainAccountId: (await prisma.mainAccount.findFirst({ where: { code: '01-04' } }))!.id, debit: 150000, credit: 0, narration: 'Purchase PI-000001' },
              { mainAccountId: (await prisma.mainAccount.findFirst({ where: { code: '02-01' } }))!.id, debit: 0, credit: 150000, narration: 'Purchase PI-000001' },
            ],
          },
        },
      });

      await prisma.sale.create({
        data: {
          number: 'SI-000001',
          saleDate: new Date(),
          customerId: customer1.id,
          stockLocationId: location.id,
          subtotal: 200 * 90 + 100 * 220,
          discount: 0, tax: 0,
          grandTotal: 200 * 90 + 100 * 220,
          paymentStatus: 'paid', amountPaid: 200 * 90 + 100 * 220,
          status: 'posted', postedById: admin.id, postedAt: new Date(), createdById: admin.id,
          items: {
            create: [
              { itemId: cola.id, quantity: 200, unitPrice: 90, discount: 0, tax: 0, lineTotal: 18000 },
              { itemId: milk.id, quantity: 100, unitPrice: 220, discount: 0, tax: 0, lineTotal: 22000 },
            ],
          },
        },
      });
      await prisma.inventoryTransaction.create({
        data: { itemId: cola.id, locationId: location.id, transactionType: 'SALE', referenceType: 'Sale', quantityIn: 0, quantityOut: 200, balance: 800, unitCost: 60 },
      });
      await prisma.inventoryTransaction.create({
        data: { itemId: milk.id, locationId: location.id, transactionType: 'SALE', referenceType: 'Sale', quantityIn: 0, quantityOut: 100, balance: 400, unitCost: 180 },
      });
      await prisma.voucher.create({
        data: {
          number: 'SV-000001', voucherType: 'JOURNAL', voucherDate: new Date(), status: 'posted',
          totalDebit: 40000, totalCredit: 40000,
          description: 'Sales invoice SI-000001 - Ahmed Traders', reference: 'SI-000001', createdById: admin.id,
          entries: {
            create: [
              { mainAccountId: customer1.mainAccountId!, debit: 40000, credit: 0, narration: 'Sale SI-000001' },
              { mainAccountId: (await prisma.mainAccount.findFirst({ where: { code: '04-01' } }))!.id, debit: 0, credit: 40000, narration: 'Sale SI-000001' },
            ],
          },
        },
      });
      await prisma.voucher.create({
        data: {
          number: 'RV-000001', voucherType: 'DEBIT', voucherDate: new Date(), status: 'posted',
          totalDebit: 40000, totalCredit: 40000,
          description: 'Cash receipt for SI-000001', reference: 'SI-000001', createdById: admin.id,
          entries: {
            create: [
              { mainAccountId: cashAccount.id, debit: 40000, credit: 0, narration: 'Cash received SI-000001' },
              { mainAccountId: customer1.mainAccountId!, debit: 0, credit: 40000, narration: 'Payment SI-000001' },
            ],
          },
        },
      });
    }
  }

  const existingJournal = await prisma.voucher.findFirst({ where: { number: 'JV-000001' } });
  if (!existingJournal) {
    await prisma.voucher.create({
      data: {
        number: 'JV-000001', voucherType: 'JOURNAL', voucherDate: new Date(), status: 'posted',
        totalDebit: 500000, totalCredit: 500000,
        description: 'Opening capital', createdById: admin.id,
        entries: {
          create: [
            { mainAccountId: cashAccount.id, debit: 500000, credit: 0, narration: 'Opening cash' },
            { mainAccountId: capitalAccount.id, debit: 0, credit: 500000, narration: 'Owner capital' },
          ],
        },
      },
    });
  }

  console.log('  Sample transactions ready.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });