import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { ApiException } from '../../common/exceptions/api.exception';
import {
  CreateSalaryComponentDto,
  CreateSalaryRecordDto,
  UpdateSalaryComponentDto,
  UpdateSalaryStructureDto,
} from '../dto/hr.dto';

@Injectable()
export class SalaryComponentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateSalaryComponentDto, actorId?: string) {
    const existing = await this.prisma.salaryComponent.findFirst({ where: { name: dto.name } });
    if (existing) throw ApiException.duplicateCode('Salary component name');
    const item = await this.prisma.salaryComponent.create({
      data: {
        name: dto.name,
        type: dto.type,
        calcType: dto.calcType,
        value: dto.value,
        status: dto.status ?? 'active',
        sortOrder: dto.sortOrder ?? 0,
      },
    });
    this.audit.record({
      userId: actorId, action: 'CREATE', module: 'HR', entity: 'SalaryComponent',
      entityId: item.id, message: `Salary component ${item.name} created`,
    });
    return item;
  }

  async findAll(query: { page?: number; pageSize?: number; search?: string; type?: string; status?: string }) {
    const { page = 1, pageSize = 25, search, type, status } = query;
    const where: Record<string, unknown> = {};
    if (search) where.name = { contains: search, mode: 'insensitive' };
    if (type) where.type = type;
    if (status) where.status = status;
    const [items, total] = await Promise.all([
      this.prisma.salaryComponent.findMany({
        where,
        orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.salaryComponent.count({ where }),
    ]);
    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async findAllFlat() {
    return this.prisma.salaryComponent.findMany({
      where: { status: 'active' },
      orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async findOne(id: string) {
    const item = await this.prisma.salaryComponent.findUnique({ where: { id } });
    if (!item) throw ApiException.notFound('Salary component');
    return item;
  }

  async update(id: string, dto: UpdateSalaryComponentDto, actorId?: string) {
    await this.findOne(id);
    if (dto.name) {
      const existing = await this.prisma.salaryComponent.findFirst({
        where: { name: dto.name, id: { not: id } },
      });
      if (existing) throw ApiException.duplicateCode('Salary component name');
    }
    const item = await this.prisma.salaryComponent.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.calcType !== undefined ? { calcType: dto.calcType } : {}),
        ...(dto.value !== undefined ? { value: dto.value } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      },
    });
    this.audit.record({
      userId: actorId, action: 'UPDATE', module: 'HR', entity: 'SalaryComponent',
      entityId: id, message: `Salary component ${item.name} updated`,
    });
    return item;
  }

  async remove(id: string, actorId?: string) {
    const item = await this.findOne(id);
    const linked = await this.prisma.employeeSalaryComponent.count({ where: { componentId: id } });
    if (linked) {
      throw ApiException.deleteBlocked(`Salary component "${item.name}"`, [`${linked} employee salary link`]);
    }
    await this.prisma.salaryComponent.delete({ where: { id } });
    this.audit.record({
      userId: actorId, action: 'DELETE', module: 'HR', entity: 'SalaryComponent',
      entityId: id, message: `Salary component ${item.name} deleted`,
    });
    return { id, deleted: true };
  }

  async getEmployeeStructure(employeeId: string) {
    const links = await this.prisma.employeeSalaryComponent.findMany({
      where: { employeeId },
      include: { component: true },
      orderBy: { component: { type: 'asc' } },
    });
    return links.map((l) => ({
      id: l.id,
      componentId: l.componentId,
      name: l.component.name,
      type: l.component.type,
      calcType: l.component.calcType,
      defaultValue: Number(l.component.value),
      amount: Number(l.amount),
      status: l.component.status,
    }));
  }

  async updateEmployeeStructure(employeeId: string, dto: UpdateSalaryStructureDto, actorId?: string) {
    const employee = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) throw ApiException.notFound('Employee');

    const upserts = dto.items.map((i) =>
      this.prisma.employeeSalaryComponent.upsert({
        where: { employeeId_componentId: { employeeId, componentId: i.componentId } },
        update: { amount: i.amount },
        create: { employeeId, componentId: i.componentId, amount: i.amount },
      }),
    );
    const saved = await this.prisma.$transaction(upserts);
    this.audit.record({
      userId: actorId, action: 'UPDATE', module: 'HR', entity: 'Employee',
      entityId: employeeId, message: `Salary structure updated for ${employee.fullName}`,
    });
    return saved;
  }

  async createSalaryRecord(dto: CreateSalaryRecordDto, actorId?: string) {
    const employee = await this.prisma.employee.findUnique({ where: { id: dto.employeeId } });
    if (!employee) throw ApiException.notFound('Employee');

    const record = await this.prisma.$transaction(async (tx) => {
      const created = await tx.employeeSalaryRecord.create({
        data: {
          employeeId: dto.employeeId,
          basicSalary: dto.basicSalary,
          allowance: dto.allowance,
          effectiveDate: new Date(dto.effectiveDate),
          note: dto.note ?? null,
          createdById: actorId ?? null,
        },
      });
      await tx.employee.update({
        where: { id: dto.employeeId },
        data: { basicSalary: dto.basicSalary, allowance: dto.allowance },
      });
      return created;
    });
    this.audit.record({
      userId: actorId, action: 'CREATE', module: 'HR', entity: 'EmployeeSalaryRecord',
      entityId: record.id, message: `Salary increment/set ${dto.basicSalary} for ${employee.fullName}`,
    });
    return record;
  }

  async getSalaryHistory(employeeId: string) {
    return this.prisma.employeeSalaryRecord.findMany({
      where: { employeeId },
      orderBy: { effectiveDate: 'desc' },
    });
  }
}