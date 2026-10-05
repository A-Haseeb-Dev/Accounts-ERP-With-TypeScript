/**
 * Reconciles role permissions after the catalog grows.
 *
 * The seed is deliberately conservative: it only creates the operational roles
 * the first time and never touches them again, so a company that has tuned a
 * role keeps their changes. That means a newly added permission never reaches
 * an existing role. This script closes that gap without undoing any tuning:
 *
 *   - every catalog permission is upserted (module/action kept in sync);
 *   - Super Admin is re-linked to the *full* catalog;
 *   - each baseline role is *given* any baseline permission it is missing.
 *
 * It never deletes a role_permission row, so permissions granted by hand (or
 * removed by hand) are preserved.
 *
 * Pass --create-missing-roles to also create a baseline role that does not
 * exist yet (mirroring the seed) instead of skipping it.
 *
 * Usage:  pnpm exec ts-node --compiler-options {"module":"CommonJS"} prisma/sync-role-permissions.ts
 *         DATABASE_URL=... pnpm exec ts-node --compiler-options {"module":"CommonJS"} prisma/sync-role-permissions.ts
 */
import { PrismaClient } from '@prisma/client';
import { PERMISSION_CATALOG } from '../apps/api/src/permissions/permission-catalog';
import { ROLE_BASELINES, assertBaselinesMatchCatalog } from './role-baselines';

const prisma = new PrismaClient();
const CREATE_MISSING_ROLES = process.argv.includes('--create-missing-roles');

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '(unparseable url)';
  }
}

async function main() {
  const url = process.env.DATABASE_URL ?? '';
  console.log(`Target database: ${url ? hostOf(url) : '(none set!)'}`);
  if (!url) throw new Error('DATABASE_URL is not set');

  const unknown = assertBaselinesMatchCatalog();
  if (unknown.length > 0) {
    throw new Error(`Baselines name permissions missing from the catalog:\n  ${unknown.join('\n  ')}`);
  }

  // 1. Upsert every catalog permission.
  for (const p of PERMISSION_CATALOG) {
    await prisma.permission.upsert({
      where: { name: p.name },
      create: { name: p.name, module: p.module, action: p.action },
      update: { module: p.module, action: p.action },
    });
  }
  const all = await prisma.permission.findMany({ select: { id: true, name: true } });
  console.log(`Permissions in catalog/DB: ${PERMISSION_CATALOG.length} / ${all.length}`);
  const byName = new Map(all.map((p) => [p.name, p.id]));

  // 2. Super Admin always gets the whole catalog.
  const superAdmin = await prisma.role.findFirst({ where: { name: 'Super Admin' } });
  if (!superAdmin) {
    console.log('  ! no Super Admin role found — run the seed first');
  } else {
    const existing = await prisma.rolePermission.findMany({
      where: { roleId: superAdmin.id },
      select: { permissionId: true },
    });
    const have = new Set(existing.map((r) => r.permissionId));
    const missing = all.filter((p) => !have.has(p.id)).map((p) => p.id);
    if (missing.length) {
      await prisma.rolePermission.createMany({
        data: missing.map((permissionId) => ({ roleId: superAdmin.id, permissionId })),
        skipDuplicates: true,
      });
    }
    console.log(`Super Admin: +${missing.length} permission(s), now ${all.length}`);
  }

  // 3. Top up each baseline role, never removing anything.
  for (const baseline of ROLE_BASELINES) {
    const role = await prisma.role.findFirst({ where: { name: baseline.name } });
    if (!role) {
      if (!CREATE_MISSING_ROLES) {
        console.log(`  ${baseline.name}: not present — skipped (pass --create-missing-roles to create it)`);
        continue;
      }
      const wantedNames = baseline.perms.filter((n) => byName.has(n));
      const created = await prisma.role.create({
        data: { name: baseline.name, description: baseline.description, isSystem: false, protected: false },
      });
      await prisma.rolePermission.createMany({
        data: wantedNames.map((n) => ({ roleId: created.id, permissionId: byName.get(n)! })),
        skipDuplicates: true,
      });
      console.log(`  ${baseline.name}: created with ${wantedNames.length} permission(s)`);
      continue;
    }
    const existing = await prisma.rolePermission.findMany({
      where: { roleId: role.id },
      select: { permissionId: true },
    });
    const have = new Set(existing.map((r) => r.permissionId));
    const wanted = baseline.perms.map((n) => byName.get(n)).filter((id): id is string => Boolean(id));
    const missing = wanted.filter((id) => !have.has(id));
    if (missing.length) {
      await prisma.rolePermission.createMany({
        data: missing.map((permissionId) => ({ roleId: role.id, permissionId })),
        skipDuplicates: true,
      });
    }
    console.log(`  ${baseline.name}: +${missing.length}, total ${existing.length + missing.length}`);
  }

  console.log('Done.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());