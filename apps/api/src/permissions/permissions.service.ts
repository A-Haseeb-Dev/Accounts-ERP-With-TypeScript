import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PERMISSION_CATALOG } from './permission-catalog';

export { PERMISSION_CATALOG };

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

      // Keep "Super Admin" truly full-access: reconcile the whole catalog on
      // every boot, granting any permission the role is missing. This protects
      // against both newly added permissions and permissions that were stripped
      // from the role, so the admin is never accidentally locked out.
      const superAdmin = await this.prisma.role.findFirst({
        where: { name: 'Super Admin', isSystem: true },
      });
      if (superAdmin) {
        const owned = await this.prisma.rolePermission.findMany({
          where: { roleId: superAdmin.id },
          select: { permissionId: true },
        });
        const ownedIds = new Set(owned.map((o) => o.permissionId));
        const allPerms =
          toCreate.length > 0
            ? await this.prisma.permission.findMany({ select: { id: true } })
            : existing;
        const toGrant = allPerms.filter((p) => !ownedIds.has(p.id));
        if (toGrant.length > 0) {
          await this.prisma.rolePermission.createMany({
            data: toGrant.map((p) => ({ roleId: superAdmin.id, permissionId: p.id })),
            skipDuplicates: true,
          });
          this.logger.log(`Granted Super Admin ${toGrant.length} missing permissions`);
        }
      }
    } catch (err) {
      this.logger.error(`Permission sync failed: ${(err as Error).message}`);
    }
  }

  async findAll() {
    return this.prisma.permission.findMany({ orderBy: [{ module: 'asc' }, { name: 'asc' }] });
  }
}
