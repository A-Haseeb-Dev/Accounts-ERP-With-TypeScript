import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { ApiException } from '../../common/exceptions/api.exception';
import { NumberingService } from '../../common/services/numbering.service';
import { CreateDesignationDto, UpdateDesignationDto } from '../dto/hr.dto';

@Injectable()
export class DesignationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly numbering: NumberingService,
  ) {}

  previewCode() {
    return this.numbering.preview('designation', 'DES', 3, { year: false });
  }

  private async resolveCode(requested?: string) {
    const code = requested?.trim();
    if (code) {
      const existing = await this.prisma.designation.findUnique({ where: { code } });
      if (existing) throw ApiException.duplicateCode('Designation code');
      return code;
    }
    return this.numbering.next('designation', 'DES', undefined, 3, { year: false });
  }

  private async assertUniqueName(name: string, ignoreId?: string) {
    const existing = await this.prisma.designation.findFirst({ where: { name } });
    if (existing && existing.id !== ignoreId) throw ApiException.duplicateCode('Designation name');
  }

  async create(dto: CreateDesignationDto, actorId?: string) {
    await this.assertUniqueName(dto.name);
    if (dto.departmentId) {
      const department = await this.prisma.department.findUnique({ where: { id: dto.departmentId } });
      if (!department) throw ApiException.notFound('Department');
    }
    const code = await this.resolveCode(dto.code);
    const item = await this.prisma.designation.create({
      data: {
        code,
        name: dto.name,
        description: dto.description ?? null,
        departmentId: dto.departmentId ?? null,
        status: dto.status ?? 'active',
      },
      include: { department: true },
    });
    this.audit.record({
      userId: actorId, action: 'CREATE', module: 'HR', entity: 'Designation',
      entityId: item.id, message: `Designation ${item.name} (${item.code}) created`,
    });
    return item;
  }

  async findAll(query: { page?: number; pageSize?: number; search?: string; status?: string; departmentId?: string }) {
    const { page = 1, pageSize = 25, search, status, departmentId } = query;
    const where: Record<string, unknown> = {};
    if (search) {
      where.OR = [
        { code: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (status) where.status = status;
    if (departmentId) where.departmentId = departmentId;

    const [items, total] = await Promise.all([
      this.prisma.designation.findMany({
        where,
        include: { department: true, _count: { select: { employees: true } } },
        orderBy: { name: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.designation.count({ where }),
    ]);
    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async findAllFlat() {
    return this.prisma.designation.findMany({
      where: { status: 'active' },
      include: { department: true },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const item = await this.prisma.designation.findUnique({
      where: { id },
      include: { department: true, _count: { select: { employees: true } } },
    });
    if (!item) throw ApiException.notFound('Designation');
    return item;
  }

  async update(id: string, dto: UpdateDesignationDto, actorId?: string) {
    await this.findOne(id);
    if (dto.name) await this.assertUniqueName(dto.name, id);
    if (dto.departmentId) {
      const department = await this.prisma.department.findUnique({ where: { id: dto.departmentId } });
      if (!department) throw ApiException.notFound('Department');
    }
    const item = await this.prisma.designation.update({
      where: { id },
      data: {
        ...(dto.code ? { code: dto.code.trim() } : {}),
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description ?? null } : {}),
        ...(dto.departmentId !== undefined ? { departmentId: dto.departmentId ?? null } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
      include: { department: true },
    });
    this.audit.record({
      userId: actorId, action: 'UPDATE', module: 'HR', entity: 'Designation',
      entityId: id, message: `Designation ${item.name} updated`,
    });
    return item;
  }

  async remove(id: string, actorId?: string) {
    const item = await this.findOne(id);
    const employees = await this.prisma.employee.count({ where: { designationId: id } });
    if (employees) {
      throw ApiException.deleteBlocked(`Designation "${item.name}"`, [
        `${employees} employee${employees === 1 ? '' : 's'}`,
      ]);
    }
    await this.prisma.designation.delete({ where: { id } });
    this.audit.record({
      userId: actorId, action: 'DELETE', module: 'HR', entity: 'Designation',
      entityId: id, message: `Designation ${item.name} deleted`,
    });
    return { id, deleted: true };
  }
}