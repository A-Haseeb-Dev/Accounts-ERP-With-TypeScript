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