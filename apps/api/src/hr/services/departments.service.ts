import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { ApiException } from '../../common/exceptions/api.exception';
import { NumberingService } from '../../common/services/numbering.service';
import { FeaturesService } from '../../features/features.service';
import { CreateDepartmentDto, UpdateDepartmentDto } from '../dto/hr.dto';

@Injectable()
export class DepartmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly numbering: NumberingService,
    private readonly features: FeaturesService,
  ) {}

  /** Ensures a department's company-feature toggle is enabled before acting on it. */
  private async assertFeatureEnabled(id: string) {
    const enabled = await this.features.isEnabled(`hr.departments.${id}`);
    if (!enabled) throw ApiException.forbidden('This department is disabled for your company');
  }

  previewCode() {
    return this.numbering.preview('department', 'DEP', 3, { year: false });
  }

  private async resolveCode(requested?: string) {
    const code = requested?.trim();
    if (code) {
      const existing = await this.prisma.department.findUnique({ where: { code } });
      if (existing) throw ApiException.duplicateCode('Department code');
      return code;
    }
    return this.numbering.next('department', 'DEP', undefined, 3, { year: false });
  }

  private async assertUniqueName(name: string, ignoreId?: string) {
    const existing = await this.prisma.department.findFirst({ where: { name } });
    if (existing && existing.id !== ignoreId) throw ApiException.duplicateCode('Department name');
  }

  async create(dto: CreateDepartmentDto, actorId?: string) {
    await this.assertUniqueName(dto.name);
    const code = await this.resolveCode(dto.code);
    const item = await this.prisma.department.create({
      data: {
        code,
        name: dto.name,
        description: dto.description ?? null,
        status: dto.status ?? 'active',
      },
    });
    this.audit.record({
      userId: actorId, action: 'CREATE', module: 'HR', entity: 'Department',
      entityId: item.id, message: `Department ${item.name} (${item.code}) created`,
    });
    return item;
  }

  async findAll(query: { page?: number; pageSize?: number; search?: string; status?: string }) {
    const { page = 1, pageSize = 25, search, status } = query;
    const where: Record<string, unknown> = {};
    if (search) {
      where.OR = [
        { code: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (status) where.status = status;

    const [items, total, disabledIds] = await Promise.all([
      this.prisma.department.findMany({
        where,
        include: { _count: { select: { employees: true, designations: true } } },
        orderBy: { name: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.department.count({ where }),
      this.disabledDepartmentIds(),
    ]);

    const visible = disabledIds.size ? items.filter((d) => !disabledIds.has(d.id)) : items;
    return { items: visible, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async findAllFlat() {
    const [all, disabledIds] = await Promise.all([
      this.prisma.department.findMany({
        where: { status: 'active' },
        orderBy: { name: 'asc' },
      }),
      this.disabledDepartmentIds(),
    ]);
    return disabledIds.size ? all.filter((d) => !disabledIds.has(d.id)) : all;
  }

  /** Cached set of department ids whose company-feature toggle (`hr.departments.<id>`) is off. */
  private disabledDepartmentIdsCache?: Promise<Set<string>>;
  private disabledDepartmentIds(): Promise<Set<string>> {
    if (!this.disabledDepartmentIdsCache) {
      this.disabledDepartmentIdsCache = this.prisma.systemSetting
        .findMany({ where: { key: { startsWith: 'features.hr.departments.' } } })
        .then((rows) =>
          new Set(
            rows
              .filter((r) => r.value === 'off')
              .map((r) => r.key.slice('features.hr.departments.'.length)),
          ),
        );
    }
    return this.disabledDepartmentIdsCache;
  }

  async findOne(id: string) {
    await this.assertFeatureEnabled(id);
    const item = await this.prisma.department.findUnique({
      where: { id },
      include: { _count: { select: { employees: true, designations: true } } },
    });
    if (!item) throw ApiException.notFound('Department');
    return item;
  }

  async update(id: string, dto: UpdateDepartmentDto, actorId?: string) {
    await this.findOne(id);
    if (dto.name) await this.assertUniqueName(dto.name, id);
    if (dto.code) {
      const existing = await this.prisma.department.findUnique({ where: { code: dto.code.trim() } });
      if (existing && existing.id !== id) throw ApiException.duplicateCode('Department code');
    }
    const item = await this.prisma.department.update({
      where: { id },
      data: {
        ...(dto.code ? { code: dto.code.trim() } : {}),
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description ?? null } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
    });
    this.audit.record({
      userId: actorId, action: 'UPDATE', module: 'HR', entity: 'Department',
      entityId: id, message: `Department ${item.name} updated`,
    });
    return item;
  }

  async remove(id: string, actorId?: string) {
    const item = await this.findOne(id);
    const [employees, designations] = await Promise.all([
      this.prisma.employee.count({ where: { departmentId: id } }),
      this.prisma.designation.count({ where: { departmentId: id } }),
    ]);
    const references: string[] = [];
    if (employees) references.push(`${employees} employee${employees === 1 ? '' : 's'}`);
    if (designations) references.push(`${designations} designation${designations === 1 ? '' : 's'}`);
    if (references.length) throw ApiException.deleteBlocked(`Department "${item.name}"`, references);

    await this.prisma.department.delete({ where: { id } });
    this.audit.record({
      userId: actorId, action: 'DELETE', module: 'HR', entity: 'Department',
      entityId: id, message: `Department ${item.name} deleted`,
    });
    return { id, deleted: true };
  }
}
