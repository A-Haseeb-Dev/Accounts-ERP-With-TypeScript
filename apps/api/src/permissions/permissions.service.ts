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
        // Keep "Super Admin" truly full-access: grant any newly added catalog
        // permissions to it, so existing databases don't lock the admin out.
        const superAdmin = await this.prisma.role.findFirst({
          where: { name: 'Super Admin', isSystem: true },
        });
        if (superAdmin) {
          const created = await this.prisma.permission.findMany({
            where: { name: { in: toCreate.map((p) => p.name) } },
            select: { id: true },
          });
          await this.prisma.rolePermission.createMany({
            data: created.map((p) => ({ roleId: superAdmin.id, permissionId: p.id })),
            skipDuplicates: true,
          });
        }
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
