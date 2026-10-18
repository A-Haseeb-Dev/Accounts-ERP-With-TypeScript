import { PrismaClient } from '@prisma/client';
import { PERMISSION_CATALOG } from '../apps/api/src/permissions/permission-catalog';
import { ROLE_BASELINES } from './role-baselines';
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
  const permissionIdByName = await seedPermissions();
  const roleIdByName = await seedRoles(permissionIdByName);
  await seedSuperAdmin(roleIdByName, permissionIdByName);
  await seedBaselineRoles(roleIdByName, permissionIdByName);
  await seedUsers(roleIdByName);
  await seedSettings();

  console.log('Seeding complete.');
}

async function seedOrganization() {
  // Create-only on re-runs: the company name/shortName is set by the user in
  // Settings, so re-running the seed must not push defaults back over it.
  await prisma.organization.upsert({
    where: { code: 'default-org' },
    update: { isActive: true },
    create: { id: 'default-org', code: 'default-org', name: 'My Company', shortName: 'MY', isActive: true },
  });
  console.log('  Organization ready.');
}

async function seedPermissions(): Promise<Map<string, string>> {
  // Batch-insert missing permissions in one createMany; skipDuplicates makes
  // it an idempotent create-only (equivalent to the old per-row upsert with an
  // empty update payload, which never modified existing rows).
  await prisma.permission.createMany({
    data: PERMISSION_CATALOG.map((p) => ({ name: p.name, module: p.module, action: p.action })),
    skipDuplicates: true,
  });

  const rows = await prisma.permission.findMany({ select: { id: true, name: true } });
  return new Map(rows.map((r) => [r.name, r.id]));
}

async function seedRoles(permissionIdByName: Map<string, string>): Promise<Map<string, string>> {
  const roleDefs: { name: string; description: string; isSystem: boolean; protected: boolean }[] = [
    { name: 'Developer', description: 'Full system access with server-side bypass', isSystem: true, protected: true },
    { name: 'Super Admin', description: 'Full access to all modules', isSystem: true, protected: true },
  ];

  const existingRoles = await prisma.role.findMany({ select: { id: true, name: true } });
  const roleIdByName = new Map(existingRoles.map((r) => [r.name, r.id]));

  const toCreate = roleDefs.filter((r) => !roleIdByName.has(r.name));
  if (toCreate.length > 0) {
    await prisma.role.createMany({ data: toCreate });
    const refreshed = await prisma.role.findMany({ select: { id: true, name: true } });
    for (const r of refreshed) roleIdByName.set(r.name, r.id);
  }

  return roleIdByName;
}

async function seedSuperAdmin(
  roleIdByName: Map<string, string>,
  permissionIdByName: Map<string, string>,
) {
  const superAdminId = roleIdByName.get('Super Admin');
  if (!superAdminId) return;

  const allPermissionIds = [...permissionIdByName.values()];

  // Diff-based sync: only rewrite links when they actually differ, avoiding a
  // full delete + re-insert churn on every seed run.
  const existing = await prisma.rolePermission.findMany({
    where: { roleId: superAdminId },
    select: { permissionId: true },
  });
  const existingSet = new Set(existing.map((r) => r.permissionId));
  const desiredSet = new Set(allPermissionIds);

  const toAdd = allPermissionIds.filter((id) => !existingSet.has(id));
  const toRemove = existing.filter((r) => !desiredSet.has(r.permissionId)).map((r) => r.permissionId);

  if (toAdd.length > 0) {
    await prisma.rolePermission.createMany({
      data: toAdd.map((permissionId) => ({ roleId: superAdminId, permissionId })),
      skipDuplicates: true,
    });
  }
  if (toRemove.length > 0) {
    await prisma.rolePermission.deleteMany({
      where: { roleId: superAdminId, permissionId: { in: toRemove } },
    });
  }
}

async function seedBaselineRoles(
  roleIdByName: Map<string, string>,
  permissionIdByName: Map<string, string>,
) {
  // Baseline permission sets live in `prisma/role-baselines.ts` so that
  // `sync-role-permissions.ts` can reuse them. They are only applied when the
  // role does not exist yet; once a user has tuned a role in the app, the seed
  // never overwrites their changes.
  const missing = ROLE_BASELINES.filter((t) => !roleIdByName.has(t.name));
  if (missing.length === 0) return;

  await prisma.role.createMany({
    data: missing.map((t) => ({ name: t.name, description: t.description, isSystem: false, protected: false })),
  });

  const refreshed = await prisma.role.findMany({ select: { id: true, name: true } });
  for (const r of refreshed) if (!roleIdByName.has(r.name)) roleIdByName.set(r.name, r.id);

  const linkRows: { roleId: string; permissionId: string }[] = [];
  for (const t of missing) {
    const roleId = roleIdByName.get(t.name);
    if (!roleId) continue;
    for (const permName of t.perms) {
      const permissionId = permissionIdByName.get(permName);
      if (permissionId) linkRows.push({ roleId, permissionId });
    }
  }
  if (linkRows.length > 0) {
    await prisma.rolePermission.createMany({ data: linkRows, skipDuplicates: true });
  }
  console.log(`  Custom roles created: ${missing.map((t) => t.name).join(', ')}`);
}

async function seedUsers(roleIdByName: Map<string, string>) {
  const argon2 = (await import('argon2')).default;

  const defs = [
    { fullName: 'Developer', username: 'developer', password: 'Developer@123', email: 'developer@has-erp.local', roles: ['Developer', 'Super Admin'] },
    { fullName: 'System Admin', username: 'admin', password: 'Admin@123', email: 'admin@has-erp.local', roles: ['Super Admin'] },
  ];

  const existingUsers = await prisma.user.findMany({
    where: { username: { in: defs.map((d) => d.username) } },
    select: { id: true, username: true },
  });
  const userIdByName = new Map(existingUsers.map((u) => [u.username, u.id]));

  // Hash in parallel only for users that don't exist yet.
  const toCreate = defs.filter((d) => !userIdByName.has(d.username));
  const hashes = await Promise.all(toCreate.map((d) => argon2.hash(d.password)));
  if (toCreate.length > 0) {
    await prisma.user.createMany({
      data: toCreate.map((d, i) => ({
        fullName: d.fullName,
        username: d.username,
        passwordHash: hashes[i],
        email: d.email,
        status: 'active',
      })),
    });
    const refreshed = await prisma.user.findMany({
      where: { username: { in: toCreate.map((d) => d.username) } },
      select: { id: true, username: true },
    });
    for (const u of refreshed) userIdByName.set(u.username, u.id);
  }

  // Diff-based role linking: only touch rows when the desired set differs.
  for (const def of defs) {
    const userId = userIdByName.get(def.username);
    if (!userId) continue;

    const desiredRoleIds = def.roles
      .map((name) => roleIdByName.get(name))
      .filter((id): id is string => Boolean(id));

    const existingLinks = await prisma.userRole.findMany({
      where: { userId },
      select: { roleId: true },
    });
    const existingSet = new Set(existingLinks.map((l) => l.roleId));
    const desiredSet = new Set(desiredRoleIds);

    const toAdd = desiredRoleIds.filter((id) => !existingSet.has(id));
    const toRemove = existingLinks.filter((l) => !desiredSet.has(l.roleId)).map((l) => l.roleId);

    if (toAdd.length > 0) {
      await prisma.userRole.createMany({
        data: toAdd.map((roleId) => ({ userId, roleId })),
        skipDuplicates: true,
      });
    }
    if (toRemove.length > 0) {
      await prisma.userRole.deleteMany({ where: { userId, roleId: { in: toRemove } } });
    }
  }
  console.log('  Users ready.');
}

async function seedSettings() {
  // Create-only as well: currency / date format / timezone are user choices,
  // and a re-run of the seed must never silently reset them. One batched
  // createMany with skipDuplicates replaces four sequential upserts.
  await prisma.systemSetting.createMany({
    data: [
      { key: 'currency', value: 'PKR', organizationId: 'default-org' },
      { key: 'dateFormat', value: 'DD/MM/YYYY', organizationId: 'default-org' },
      { key: 'timezone', value: 'Asia/Karachi', organizationId: 'default-org' },
      { key: 'inventory.negative_stock', value: 'false', organizationId: 'default-org' },
    ],
    skipDuplicates: true,
  });
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
