import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { ApiException } from '../../common/exceptions/api.exception';
import { CreateEmployeeLoanDto, UpdateEmployeeLoanDto } from '../dto/hr.dto';

@Injectable()
export class LoansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateEmployeeLoanDto, actorId?: string) {
    const employee = await this.prisma.employee.findUnique({ where: { id: dto.employeeId } });
    if (!employee) throw ApiException.notFound('Employee');
    const item = await this.prisma.employeeLoan.create({
      data: {
        employeeId: dto.employeeId,
        amount: dto.amount,
        installment: dto.installment,
        startMonth: dto.startMonth,
        startYear: dto.startYear,
        note: dto.note ?? null,
      },
      include: { employee: { select: { fullName: true, code: true } } },
    });
    this.audit.record({
      userId: actorId, action: 'CREATE', module: 'HR', entity: 'EmployeeLoan',
      entityId: item.id, message: `Loan ${dto.amount} for ${item.employee.fullName}`,
    });
    return item;
  }

  async findAll(query: { page?: number; pageSize?: number; status?: string; employeeId?: string; search?: string }) {
    const { page = 1, pageSize = 25, status, employeeId, search } = query;
    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (employeeId) where.employeeId = employeeId;
    if (search) {
      where.employee = { fullName: { contains: search, mode: 'insensitive' } };
    }
    const [items, total] = await Promise.all([
      this.prisma.employeeLoan.findMany({
        where,
        include: { employee: { select: { fullName: true, code: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.employeeLoan.count({ where }),
    ]);
    const enriched = items.map((l) => ({
      ...l,
      remaining: Math.max(0, Number(l.amount) - Number(l.paidAmount)),
    }));
    return { items: enriched, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async findOne(id: string) {
    const item = await this.prisma.employeeLoan.findUnique({
      where: { id },
      include: { employee: { select: { fullName: true, code: true } } },
    });
    if (!item) throw ApiException.notFound('Loan');
    return { ...item, remaining: Math.max(0, Number(item.amount) - Number(item.paidAmount)) };
  }

  async update(id: string, dto: UpdateEmployeeLoanDto, actorId?: string) {
    await this.findOne(id);
    const item = await this.prisma.employeeLoan.update({
      where: { id },
      data: {
        ...(dto.amount !== undefined ? { amount: dto.amount } : {}),
        ...(dto.installment !== undefined ? { installment: dto.installment } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.note !== undefined ? { note: dto.note ?? null } : {}),
      },
      include: { employee: { select: { fullName: true } } },
    });
    this.audit.record({
      userId: actorId, action: 'UPDATE', module: 'HR', entity: 'EmployeeLoan',
      entityId: id, message: `Loan for ${item.employee.fullName} updated`,
    });
    return item;
  }

  async remove(id: string, actorId?: string) {
    await this.findOne(id);
    await this.prisma.employeeLoan.delete({ where: { id } });
    this.audit.record({
      userId: actorId, action: 'DELETE', module: 'HR', entity: 'EmployeeLoan',
      entityId: id, message: 'Loan deleted',
    });
    return { id, deleted: true };
  }
}