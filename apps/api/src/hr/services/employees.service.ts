import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { ApiException } from '../../common/exceptions/api.exception';
import { NumberingService } from '../../common/services/numbering.service';
import { CreateEmployeeDto, UpdateEmployeeDto } from '../dto/hr.dto';

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly numbering: NumberingService,
  ) {}

  previewCode() {
    return this.numbering.preview('employee', 'EMP', 4, { year: false });
  }

  private async validateRefs(employeeId?: string, designationId?: string) {
    if (employeeId) {
      const department = await this.prisma.department.findFirst({ where: { id: employeeId, status: 'active' } });
      if (!department) throw ApiException.notFound('Department');
    }
    if (designationId) {
      const designation = await this.prisma.designation.findFirst({ where: { id: designationId, status: 'active' } });
      if (!designation) throw ApiException.notFound('Designation');
    }
  }

  async create(dto: CreateEmployeeDto, actorId?: string) {
    const requestedCode = dto.code?.trim();
    if (requestedCode) {
      const existing = await this.prisma.employee.findUnique({ where: { code: requestedCode } });
      if (existing) throw ApiException.duplicateCode('Employee code');
    }
    const code = requestedCode || (await this.numbering.next('employee', 'EMP', undefined, 4, { year: false }));
    await this.validateRefs(dto.departmentId, dto.designationId);

    const item = await this.prisma.employee.create({
      data: {
        code,
        fullName: dto.fullName,
        fatherName: dto.fatherName ?? null,
        cnic: dto.cnic ?? null,
        phone: dto.phone ?? null,
        email: dto.email ?? null,
        address: dto.address ?? null,
        departmentId: dto.departmentId ?? null,
        designationId: dto.designationId ?? null,
        joinDate: dto.joinDate ? new Date(dto.joinDate) : new Date(),
        employmentType: dto.employmentType ?? 'permanent',
        basicSalary: dto.basicSalary ?? 0,
        allowance: dto.allowance ?? 0,
        bankName: dto.bankName ?? null,
        bankAccount: dto.bankAccount ?? null,
        description: dto.description ?? null,
        status: dto.status ?? 'active',
      },
      include: { department: true, designation: true },
    });
    this.audit.record({
      userId: actorId, action: 'CREATE', module: 'HR', entity: 'Employee',
      entityId: item.id, message: `Employee ${item.fullName} (${item.code}) created`,
    });
    return item;
  }

  async findAll(query: { page?: number; pageSize?: number; search?: string; status?: string; departmentId?: string; designationId?: string }) {
    const { page = 1, pageSize = 25, search, status, departmentId, designationId } = query;
    const where: Record<string, unknown> = {};
    if (search) {
      where.OR = [
        { code: { contains: search, mode: 'insensitive' } },
        { fullName: { contains: search, mode: 'insensitive' } },
        { cnic: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (status) where.status = status;
    if (departmentId) where.departmentId = departmentId;
    if (designationId) where.designationId = designationId;

    const [items, total] = await Promise.all([
      this.prisma.employee.findMany({
        where,
        include: { department: true, designation: true },
        orderBy: { code: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.employee.count({ where }),
    ]);
    return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async findAllFlat() {
    return this.prisma.employee.findMany({
      where: { status: 'active' },
      include: { department: true, designation: true },
      orderBy: { fullName: 'asc' },
    });
  }

  async findOne(id: string) {
    const item = await this.prisma.employee.findUnique({
      where: { id },
      include: {
        department: true,
        designation: true,
        _count: { select: { attendance: true, leaveRequests: true, payrollItems: true } },
      },
    });
    if (!item) throw ApiException.notFound('Employee');
    return item;
  }

  async update(id: string, dto: UpdateEmployeeDto, actorId?: string) {
    await this.findOne(id);
    if (dto.departmentId || dto.designationId) {
      await this.validateRefs(dto.departmentId, dto.designationId);
    }
    const item = await this.prisma.employee.update({
      where: { id },
      data: {
        ...(dto.code ? { code: dto.code.trim() } : {}),
        ...(dto.fullName !== undefined ? { fullName: dto.fullName } : {}),
        ...(dto.fatherName !== undefined ? { fatherName: dto.fatherName ?? null } : {}),
        ...(dto.cnic !== undefined ? { cnic: dto.cnic ?? null } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone ?? null } : {}),
        ...(dto.email !== undefined ? { email: dto.email ?? null } : {}),
        ...(dto.address !== undefined ? { address: dto.address ?? null } : {}),
        ...(dto.departmentId !== undefined ? { departmentId: dto.departmentId ?? null } : {}),
        ...(dto.designationId !== undefined ? { designationId: dto.designationId ?? null } : {}),
        ...(dto.joinDate !== undefined ? { joinDate: new Date(dto.joinDate) } : {}),
        ...(dto.employmentType !== undefined ? { employmentType: dto.employmentType } : {}),
        ...(dto.basicSalary !== undefined ? { basicSalary: dto.basicSalary ?? 0 } : {}),
        ...(dto.allowance !== undefined ? { allowance: dto.allowance ?? 0 } : {}),
        ...(dto.bankName !== undefined ? { bankName: dto.bankName ?? null } : {}),
        ...(dto.bankAccount !== undefined ? { bankAccount: dto.bankAccount ?? null } : {}),
        ...(dto.description !== undefined ? { description: dto.description ?? null } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.exitDate !== undefined ? { exitDate: dto.exitDate ? new Date(dto.exitDate) : null } : {}),
        ...(dto.exitReason !== undefined ? { exitReason: dto.exitReason ?? null } : {}),
      },
      include: { department: true, designation: true },
    });
    this.audit.record({
      userId: actorId, action: 'UPDATE', module: 'HR', entity: 'Employee',
      entityId: id, message: `Employee ${item.fullName} updated`,
    });
    return item;
  }

  async remove(id: string, actorId?: string) {
    const item = await this.findOne(id);
    const [attendance, leaves, payroll] = await Promise.all([
      this.prisma.hrAttendance.count({ where: { employeeId: id } }),
      this.prisma.hrLeaveRequest.count({ where: { employeeId: id } }),
      this.prisma.payrollItem.count({ where: { employeeId: id } }),
    ]);
    const references: string[] = [];
    if (attendance) references.push(`${attendance} attendance record${attendance === 1 ? '' : 's'}`);
    if (leaves) references.push(`${leaves} leave request${leaves === 1 ? '' : 's'}`);
    if (payroll) references.push(`${payroll} payroll item${payroll === 1 ? '' : 's'}`);
    if (references.length) throw ApiException.deleteBlocked(`Employee "${item.fullName}"`, references);

    await this.prisma.employee.delete({ where: { id } });
    this.audit.record({
      userId: actorId, action: 'DELETE', module: 'HR', entity: 'Employee',
      entityId: id, message: `Employee ${item.fullName} deleted`,
    });
    return { id, deleted: true };
  }
}